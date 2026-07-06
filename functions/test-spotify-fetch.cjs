// Using global fetch

const embedUrl = 'https://open.spotify.com/embed/episode/43bBtLDRkM1607Yq7l4u3E';

async function run() {
  console.log("Fetching Spotify Embed URL...");
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML length:", html.length);
    
    // Search for Title/Description/Show in the embed page HTML
    const titleMatch = html.match(/"title":"([^"]+)"/) || html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/"description":"([^"]+)"/) || html.match(/<meta name="description" content="([^"]+)"/);
    const imgMatch = html.match(/"coverArtUrl":"([^"]+)"/) || html.match(/<meta property="og:image" content="([^"]+)"/);
    
    console.log("Title:", titleMatch ? titleMatch[1] : 'Not Found');
    console.log("Description:", descMatch ? descMatch[1] : 'Not Found');
    console.log("Image:", imgMatch ? imgMatch[1] : 'Not Found');
    
    // Print first 1000 characters to inspect structures if needed
    console.log("\nSample HTML snippet:");
    console.log(html.substring(0, 1000));
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

run();
