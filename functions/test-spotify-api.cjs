const CLIENT_ID = '49bb34cdef9c4181b103775876b1bc67';
const CLIENT_SECRET = '48557f5ba9af428f861637bed229cc98';

async function test() {
  try {
    console.log("Requesting access token...");
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      throw new Error(`Token request failed: ${tokenRes.status} ${errorText}`);
    }
    
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    console.log("Token obtained successfully!");
    
    // Fetch a public podcast episode, e.g., Joe Rogan or any standard podcast episode
    const episodeId = '43bBtLDRkM1607Yq7l4u3E';
    console.log(`Fetching episode metadata for ID: ${episodeId}...`);
    const episodeRes = await fetch(`https://api.spotify.com/v1/episodes/${episodeId}?market=US`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!episodeRes.ok) {
      const errorText = await episodeRes.text();
      throw new Error(`Episode request failed: ${episodeRes.status} ${errorText}`);
    }
    
    const episodeData = await episodeRes.json();
    console.log("Metadata fetched successfully!");
    console.log("Episode Title:", episodeData.name);
    console.log("Show Name:", episodeData.show ? episodeData.show.name : 'Unknown');
    console.log("Description:", episodeData.description ? episodeData.description.substring(0, 100) + '...' : 'None');
    console.log("Images:", episodeData.images);
  } catch (err) {
    console.error("Spotify API test failed:", err);
  }
}

test();
