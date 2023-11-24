const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
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
  const authBase64 = Buffer.from(authString, 'utf-8').toString('base64');

  const url = 'https://accounts.spotify.com/api/token';
  const headers = {
    Authorization: `Basic ${authBase64}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const data = { grant_type: 'client_credentials' };

  try {
    const response = await axios.post(url, data, { headers });
    const { access_token: token } = response.data;
    return token;
  } catch (error) {
    console.error(`Error getting token: ${error.message}`);
    return null;
  }
}

async function getPlaylistItems(token, playlistId) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const response = await axios.get(url, { headers });
    const { items } = response.data;

    if (items) {
      const songs = items.map((item) => {
        const { name: songName, artists } = item.track;
        const artistNames = artists.map((artist) => artist.name).join(', ');
        return `${songName} by ${artistNames}`;
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
  const youtube = google.youtube({
    version: 'v3',
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

      const { items } = searchResponse.data;

      if (items) {
        const videoId = items[0].id.videoId;
        videoIds.push(videoId);
      } else {
        console.log(`No video found for query: ${video}`);
      }
    } catch (error) {
      console.error(`Error getting video ID: ${error.message}`);
    }
  }

  return videoIds;
}

async function createYTPlaylist(videoIds) {
  const scopes = ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.force-ssl'];

  process.env.OAUTHLIB_INSECURE_TRANSPORT = '1';

  const auth = new google.auth.GoogleAuth({
    keyFile: 'yt.json',
    scopes,
  });

  const youtube = google.youtube({
    version: 'v3',
    auth: await auth.getClient(),
  });

  try {
    const createRequest = await youtube.playlists.insert({
      part: 'snippet',
      requestBody: {
        snippet: {
          title: 'Test Playlist',
          description: 'This is a test',
          privacyStatus: 'public',
        },
      },
    });

    const playlistId = createRequest.data.id;

    for (const videoId of videoIds) {
      await youtube.playlistItems.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId,
            },
          },
        },
      });
    }

    return createRequest.data;
  } catch (error) {
    console.error(`Error creating YouTube playlist: ${error.message}`);
    return null;
  }
}

app.post('/convert', async (req, res) => {
  try {
    const spClientId = process.env.SP_CLIENT_ID;
    const spClientSecret = process.env.SP_CLIENT_SECRET;
    const ytApiKey = process.env.YT_API_KEY;

    const token = await getToken(spClientId, spClientSecret);

    // Retrieve playlist ID from the request body
    const spPlaylistId = req.body.spPlaylistId;

    // Check if spPlaylistId is present
    if (!spPlaylistId) {
      console.log('Invalid request: Missing spPlaylistId');
      res.status(400).send('Invalid request: Missing spPlaylistId');
      return;
    }

    const resultSP = await getPlaylistItems(token, spPlaylistId);


    const videoIds = await getVideoIds(ytApiKey, resultSP);
    const resultYT = await createYTPlaylist(videoIds);

    if (resultYT) {
      console.log('Playlist created successfully!');
      console.log('Playlist ID:', resultYT.id);
      res.send('Playlist created successfully! Playlist ID: ' + resultYT.id);
    } else {
      console.log('Failed to create YouTube playlist.');
      res.status(500).send('Failed to create YouTube playlist.');
    }
  } catch (error) {
    console.error(`Error in button click handler: ${error.message}`);
    res.status(500).send('An error occurred.');
  }
});
