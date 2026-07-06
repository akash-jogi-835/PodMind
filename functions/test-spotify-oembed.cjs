async function test() {
  try {
    const episodeUrl = 'https://open.spotify.com/episode/43bBtLDRkM1607Yq7l4u3E';
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(episodeUrl)}`;
    
    console.log("Fetching oEmbed from:", oembedUrl);
    const res = await fetch(oembedUrl);
    
    console.log("Status:", res.status);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed: ${res.status} ${text}`);
    }
    
    const data = await res.json();
    console.log("oEmbed Data:");
    console.log("Title:", data.title);
    console.log("Author Name:", data.provider_name);
    console.log("Thumbnail URL:", data.thumbnail_url);
    console.log("Full Response:", data);
  } catch (err) {
    console.error("oEmbed test failed:", err);
  }
}

test();
