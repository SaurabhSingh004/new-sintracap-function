// services/scraperService.js
const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,/;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script, style, svg, and hidden elements
    $('script, style, noscript, svg, [style*="display:none"], [style*="display: none"], [hidden]').remove();
    
    // Extract all visible text
    const allText = [];
    $('p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, label, a, button, figcaption, blockquote').each((i, el) => {
      const ownText = $(el).clone().children().remove().end().text().trim();
      if (ownText && ownText.length > 0) {
        allText.push(ownText);
      }
    });
    
    // Clean up the text
    return [...new Set(allText)]
      .map(text => text.replace(/\s+/g, ' ').trim())
      .filter(text => text.length > 0)
      .join('\n');
  } catch (error) {
    console.error(`Error scraping: ${error.message}`);
    throw new Error(`Scraping failed: ${error.message}`);
  }
}

module.exports = { scrapeContent }; 