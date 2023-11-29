const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const base64 = require('base-64');  
require('dotenv').config();

const app = express();
const port = 3000;

const path = require('path');

app.use(express.static('static'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/index.html'));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

async function getToken(spClientId, spClientSecret) {
  const authString = `${spClientId}:${spClientSecret}`;
  const authBase64 = base64.encode(authString);

  const url = 'https://accounts.spotify.com/api/token';
  const headers = { 
    'Authorization': 'Basic ' + authBase64,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const data = 'grant_type=client_credentials';

  try {
    const response = await axios.post(url, data, { headers });
    const token = response.data.access_token;
    return token;
  } catch (error) {
    console.error(`Error getting token: ${error.message}`);
    return null;
  }
}


async function getPlaylistItems(token, playlistId) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  const headers = {
    'Authorization': `Bearer ${token}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const jsonResult = response.data;

    if ('items' in jsonResult) {
      const songs = jsonResult.items.map(item => {
        const track = item.track;
        const songName = track.name;
        const artists = track.artists.map(artist => artist.name).join(', ');
        const fullName = `${songName} by ${artists}`;
        return fullName;
      });

      return songs;
    } else {
      console.log('No items found in the playlist.');
      return null;
    }
  } catch (error) {
    console.error(`Error getting playlist items: ${error.message}`);
    return null;
  }
}


async function getVideoIds(ytApiKey, videos) {
  const apiServiceName = 'youtube';
  const apiVersion = 'v3';

  const youtube = google.youtube({
    version: apiVersion,
    auth: ytApiKey,
  });

  const videoIds = [];

  for (const video of videos) {
    try {
      const searchResponse = await youtube.search.list({
        q: video,
        type: 'video',
        part: 'id',
        maxResults: 1,
      });

      const items = searchResponse.data.items;

      if (items && items.length > 0) {
        const videoId = items[0].id.videoId;
        videoIds.push(videoId);
      } else {
        console.log(`No video found for query: ${video}`);
      }
    } catch (error) {
      console.error(`Error searching for video: ${error.message}`);
    }
  }

  return videoIds;
}


app.post('/convert', async (req, res) => {
  try {
    const spClientId = process.env.SP_CLIENT_ID;
    const spClientSecret = process.env.SP_CLIENT_SECRET;
    const ytApiKey = process.env.YT_API_KEY;
    const spPlaylistId = req.body.spPlaylistId;

    const token = await getToken(spClientId, spClientSecret);
    console.log(token);

    const songs = await getPlaylistItems(token, spPlaylistId);
    console.log(songs);

    const videoIds = await getVideoIds(ytApiKey, songs);
    console.log(videoIds);

    // Send the videoIds array to the frontend
    res.json({ videoIds });
  } catch (error) {
    console.error(`Error in /convert endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
