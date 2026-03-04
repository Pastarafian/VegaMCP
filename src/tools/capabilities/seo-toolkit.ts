import { logAudit } from '../../db/graph-store.js';

export const seoToolkitSchema = {
  name: 'seo_toolkit',
  description: `Universal SEO Toolkit. Evaluate page structures, semantics, semantic web markup, and generate meta tags.
Actions:
- page_analyzer: Evaluates HTML snippet for SEO best practices (H1s, ALTs, titles).
- semantic_check: Checks for proper HTML5 semantic tagging.
- meta_generator: Generates essential meta and OpenGraph tags for a given topic.
- structured_data: Generates JSON-LD structured data schemas (schema.org).`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'page_analyzer', 'semantic_check', 'meta_generator', 'structured_data'
        ],
        description: 'SEO toolkit action to perform',
      },
      html_snippet: { type: 'string', description: 'HTML snippet to evaluate' },
      topic: { type: 'string', description: 'Topic or title for generation' },
      type: { type: 'string', description: 'Type of structured data (e.g., Article, Product)' }
    },
    required: ['action'],
  },
};

function ok(data: any) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, ...data }, null, 2) }] };
}

function fail(code: string, message: string) {
  return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

export async function handleSeoToolkit(args: any): Promise<{ content: Array<{ type: string; text?: string }> }> {
  const start = Date.now();
  
  try {
    switch (args.action) {
      case 'page_analyzer': {
        const html = args.html_snippet || '';
        let score = 100;
        const issues = [];
        
        const h1Count = (html.match(/<h1/gi) || []).length;
        if (h1Count === 0) {
          score -= 30;
          issues.push('Missing <h1> tag. Every page should have exactly one H1.');
        } else if (h1Count > 1) {
          score -= 10;
          issues.push('Multiple <h1> tags detected. Stick to one primary heading per page.');
        }

        const imgCount = (html.match(/<img/gi) || []).length;
        const altCount = (html.match(/alt=["'].*?["']/gi) || []).length;
        if (imgCount > altCount) {
          score -= 20;
          issues.push(`Found ${imgCount} images but only ${altCount} alt attributes. All images need descriptive alt text.`);
        }

        if (!html.toLowerCase().includes('<title>') && html.includes('<head>')) {
          score -= 25;
          issues.push('Missing <title> tag in the head area.');
        }

        if (!html.toLowerCase().includes('meta name="description"')) {
          score -= 15;
          issues.push('Missing meta description tag for search engine summaries.');
        }

        return ok({
          action: 'page_analyzer',
          rating: {
            seo_score: Math.max(score, 0),
            grade: score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'F'
          },
          issues,
          ai_analysis: { hint: 'SEO scores above 90 ensure the page is indexable and ranks well.' }
        });
      }

      case 'semantic_check': {
        const html = args.html_snippet || '';
        let score = 100;
        const advice = [];

        if (html.includes('<div id="header"') || html.includes('<div class="header"')) {
          score -= 15;
          advice.push('Use the semantic <header> tag instead of a div with class/id header.');
        }
        if (html.includes('<div id="nav"') || html.includes('<div class="nav"')) {
          score -= 15;
          advice.push('Use the semantic <nav> tag for navigation menus.');
        }
        if (html.includes('<div id="footer"') || html.includes('<div class="footer"')) {
          score -= 15;
          advice.push('Use the semantic <footer> tag instead of a div.');
        }
        if (!html.includes('<main>')) {
          score -= 20;
          advice.push('Missing <main> tag to encapsulate the primary page content.');
        }

        return ok({
          action: 'semantic_check',
          rating: {
            semantic_score: Math.max(score, 0),
            grade: score >= 80 ? 'Good' : 'Needs Improvement'
          },
          advice,
          ai_analysis: { hint: 'Semantic HTML is critical for accessibility screen readers as well as search engine crawlers.' }
        });
      }

      case 'meta_generator': {
        const topic = args.topic || 'General Web Page';
        const metaTags = `
<title>${topic} | Premium Service</title>
<meta name="description" content="Discover the best ${topic.toLowerCase()} tools and services to scale your business today.">
<meta name="robots" content="index, follow">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:title" content="${topic}">
<meta property="og:description" content="Discover the best ${topic.toLowerCase()} tools and services.">
<meta property="og:image" content="https://example.com/banner.jpg">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${topic}">
<meta name="twitter:description" content="Discover the best ${topic.toLowerCase()} tools and services.">
<meta name="twitter:image" content="https://example.com/banner.jpg">
`;
        return ok({
          action: 'meta_generator',
          topic,
          tags: metaTags,
          ai_analysis: { hint: 'Include these tags in your document <head> layer to guarantee perfect social media previews.' }
        });
      }

      case 'structured_data': {
        const type = args.type || 'Article';
        let schema: any = {
          "@context": "https://schema.org",
          "@type": type,
          "name": args.topic || "Example Item"
        };

        if (type.toLowerCase() === 'article') {
          schema = {
            ...schema,
            "headline": args.topic || "Article Headline",
            "author": { "@type": "Person", "name": "Author Name" },
            "datePublished": new Date().toISOString().split('T')[0],
            "image": "https://example.com/image.jpg"
          };
        } else if (type.toLowerCase() === 'product') {
          schema = {
            ...schema,
            "description": `Detailed description for ${args.topic}`,
            "offers": {
              "@type": "Offer",
              "priceCurrency": "USD",
              "price": "29.99",
              "availability": "https://schema.org/InStock"
            }
          };
        }

        return ok({
          action: 'structured_data',
          type,
          json_ld: `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`,
          ai_analysis: { hint: 'Inject this JSON-LD script into your page to enable Google Rich Snippets.' }
        });
      }

      default:
        return fail('UNKNOWN_ACTION', `Unknown action: ${args.action}`);
    }
  } catch (error: any) {
    const elapsed = Date.now() - start;
    logAudit('seo_toolkit', `${args.action || 'unknown'}: Error: ${error.message}`, false, 'SEO_TOOLKIT_ERROR', elapsed);
    return fail('SEO_TOOLKIT_ERROR', `${args.action} failed: ${error.message}`);
  }
}
