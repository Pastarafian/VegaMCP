import { handleTheClaw } from './build/tools/capabilities/the-claw.js';
import fs from 'fs';

async function runTest() {
    console.log("1. Registering VPS Gateway against The Claw...");
    let res = await handleTheClaw({
        action: 'register',
        agent_id: 'vps-1',
        name: 'VegaVPS',
        host: '127.0.0.1',
        port: 42015,
        ide: 'vega-terminal',
        model: 'deepseek-r1:8b'
    });
    console.log(res.content[0].text);

    // Give it a moment to connect
    await new Promise(r => setTimeout(r, 2000));

    console.log("\n2. Launching VegaTrading Backend on VPS via Claw...");
    res = await handleTheClaw({
        action: 'ide_action',
        agent_id: 'vps-1',
        action_name: 'run_terminal_command',
        prompt_text: 'schtasks /run /tn "VegaServerStart" 2>null || schtasks /run /tn "VegaServerStart2"'
    });
    // Actually, The Claw has `exec` underneath but it's not exposed in `the_claw` schema directly, so we can use `type` or something if needed. Wait! `the_claw` doesn't have `exec`.
    // We can use Python SSH to start the process, then `screenshot` using The Claw.
    
    // So let's just use `screenshot` to see if VegaSentinel is working!
    console.log("\n3. Taking VPS Desktop Screenshot via The Claw...");
    res = await handleTheClaw({
        action: 'screenshot',
        agent_id: 'vps-1'
    });
    
    const parsed = JSON.parse(res.content[0].text);
    if(parsed.success) {
        console.log(`Success! Screen vision analyzed: ${parsed.screen_state?.description}`);
    } else {
        console.log("Error:", res.content[0].text);
    }
}

runTest().catch(console.error);
