const fs = require('fs');
const { Client } = require('ssh2');

const vps = { host: 'REDACTED_IP', username: 'root', password: process.env.VPS_PASSWORD || 'REDACTED_PASSWORD' };

const pushText = (conn, text, remote) => new Promise((resolve, reject) => {
  conn.sftp((err, sftp) => {
    if (err) return reject(err);
    const stream = sftp.createWriteStream(remote);
    stream.on('close', resolve).on('error', reject);
    stream.end(text);
  });
});

const execCmd = (conn, cmd) => new Promise((resolve, reject) => {
  conn.exec(cmd, { pty: true }, (err, stream) => {
    if (err) return reject(err);
    let out = '';
    stream.on('data', d => {
      const chunk = d.toString();
      out += chunk;
      process.stdout.write(chunk);
    });
    stream.on('close', code => {
      if (code !== 0) reject(new Error('Command failed with code ' + code));
      else resolve(out);
    });
  });
});

const cargoToml = `
[package]
name = "rust_vnc"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.0", features = ["full"] }
warp = "0.3"
futures-util = "0.3"
image = "0.24"
# Using X11 directly for fastest screen capture
scrap = "0.5" 
`;

const mainRs = `
use std::convert::Infallible;
use warp::Filter;
use std::time::Duration;
use futures_util::{stream::iter, StreamExt};
use scrap::{Capturer, Display};
use std::io::ErrorKind::WouldBlock;
use image::{ImageBuffer, RgbaImage};
use std::io::Cursor;
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() {
    println!("Starting Rust MJPEG Stream Server...");

    // We need shared access to the capturer because of async streams
    // Alternatively, we spawn a thread that constantly updates an atomic buffer
    // and warp just serves the latest jpeg. Let's do the latest frame buffer!
    
    let latest_jpeg = Arc::new(Mutex::new(Vec::new()));
    let jpeg_writer = Arc::clone(&latest_jpeg);
    
    std::thread::spawn(move || {
        let display = Display::primary().unwrap();
        let mut capturer = Capturer::new(display).unwrap();
        let width = capturer.width() as u32;
        let height = capturer.height() as u32;

        loop {
            // Target ~30fps for JPEG encoding
            std::thread::sleep(Duration::from_millis(30));
            
            let frame = match capturer.frame() {
                Ok(frame) => frame,
                Err(e) if e.kind() == WouldBlock => continue,
                Err(e) => panic!("Capture error: {}", e),
            };

            // Scrap returns BGRA. We convert to RGBA for the image crate
            let mut img: RgbaImage = ImageBuffer::new(width, height);
            for (x, y, pixel) in img.enumerate_pixels_mut() {
                let i = (y * width + x) as usize * 4;
                pixel[0] = frame[i + 2]; // R
                pixel[1] = frame[i + 1]; // G
                pixel[2] = frame[i];     // B
                pixel[3] = 255;          // A
            }

            // Downscale to 1280x720 for bandwidth using 'Nearest' for speed
            let img = image::imageops::resize(&img, 1280, 720, image::imageops::FilterType::Nearest);

            let mut cursor = Cursor::new(Vec::new());
            
            // Fast JPEG encoding
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 60);
            if encoder.encode_image(&img).is_ok() {
                let mut data = jpeg_writer.lock().unwrap();
                *data = cursor.into_inner();
            }
        }
    });

    let route = warp::path("stream").and(warp::get()).map(move || {
        let jpeg_reader = Arc::clone(&latest_jpeg);
        
        let stream = iter(std::iter::from_fn(move || {
            std::thread::sleep(Duration::from_millis(50)); // 20fps transmit
            
            let data = jpeg_reader.lock().unwrap().clone();
            if data.is_empty() {
                return Some(Ok::<_, Infallible>(vec![]));
            }
            
            let chunk = format!(
                "--frame\\r\\nContent-Type: image/jpeg\\r\\nContent-Length: {}\\r\\n\\r\\n",
                data.len()
            );

            let mut out = Vec::new();
            out.extend_from_slice(chunk.as_bytes());
            out.extend_from_slice(&data);
            out.extend_from_slice(b"\\r\\n");

            Some(Ok::<_, Infallible>(out))
        })).filter(|c| futures_util::future::ready(!c.as_ref().unwrap().is_empty()));

        warp::reply::with_header(
            warp::reply::Response::new(warp::hyper::Body::wrap_stream(stream)),
            "Content-Type",
            "multipart/x-mixed-replace; boundary=frame",
        )
    });

    println!("Listening on 127.0.0.1:4282...");
    warp::serve(route).run(([127, 0, 0, 1], 4282)).await;
}
`;

const run = async () => {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      console.log('Ensuring cargo is installed...');
      await execCmd(conn, 'export PATH="$HOME/.cargo/bin:$PATH" && cargo --version || (curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y)');
      
      console.log('Installing dependencies...');
      await execCmd(conn, 'apt-get update && apt-get install -y pkg-config clang libssl-dev xorg-dev libxcb-shm0-dev libxcb-shape0-dev libxcb-xfixes0-dev');

      console.log('Setting up Rust project...');
      await execCmd(conn, 'rm -rf /opt/rust_vnc && mkdir -p /opt/rust_vnc/src');
      
      await pushText(conn, cargoToml, '/opt/rust_vnc/Cargo.toml');
      await pushText(conn, mainRs, '/opt/rust_vnc/src/main.rs');

      console.log('Building project (This will take a few minutes)...');
      await execCmd(conn, 'export PATH="$HOME/.cargo/bin:$PATH" && cd /opt/rust_vnc && cargo build --release');
      
      console.log('Starting service via PM2...');
      await execCmd(conn, 'pm2 delete rust_vnc 2>/dev/null || true');
      await execCmd(conn, 'cd /opt/rust_vnc && export DISPLAY=:1 && pm2 start ./target/release/rust_vnc --name rust_vnc --time');
      
      console.log('Done!');
    } catch (e) {
      console.error('Error:', e);
    } finally {
      conn.end();
    }
  }).connect(vps);
};

run();
