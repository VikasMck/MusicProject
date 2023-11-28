const bodyParser = require('body-parser');
const session = require('express-session');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const path = require('path');
const express = require('express');
const axios = require('axios');
const ejs = require('ejs');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const port = 9999; //yes


app.use(express.static('static'));
app.use(express.json());

//render ejs
app.set('view engine', 'ejs');
app.engine('html', ejs.renderFile);


//didnt know views is the stock directory
app.set('views', path.join(__dirname, 'templates'));



//this makes the hash actually work and makes it more secure
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'vikas-eric-secret-parser',
  resave: false,
  saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'static')));



//connection to the database
//using master since less hassle, running this on google vm with sql server
const config = {
  server: process.env.DB_SERVER || '35.206.171.207',
  port: 1433,
  database: process.env.DB_DATABASE || 'MainDB',
  user: process.env.DB_USER || 'vikassql',
  password: process.env.DB_PASSWORD || 'Password11',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

//functions for hashing passwords
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

//function which waits for sql connection (used a lot)
const connectToDatabase = async () => {
  try {
    await sql.connect(config);
  } 
  catch (error) {
    console.error('Error connecting to the database:', error);
    throw error;
  }
};

const closeDatabaseConnection = () => {
  sql.close();
};


// navigation 

app.get(['/', '/preauth'], (req, res) => {
  const filePath = 'preauth';

  //render the ejs so it stops downloading
  res.render(filePath, {}, (err, html) => {
      if (err) {
          console.error(err);
          res.status(500).send('Internal Server Error');
      } 
      else
      {
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
      }
  });
});


//register route 
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;

  try {
    await connectToDatabase();
    const hashedPassword = await hashPassword(password);
    await sql.query`INSERT INTO Users (username, email, Password) VALUES (${username}, ${email}, ${hashedPassword})`;
    res.redirect('/login');
  } 
  catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  } 
  finally {
    closeDatabaseConnection();
  }
});

//pain
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    await connectToDatabase();
    const result = await sql.query`SELECT password, username FROM Users WHERE username = ${username}`;

    //checks if there is at least one row with the asked entry in the table
    if (result.recordset.length > 0) {
      const hashedPassword = result.recordset[0].password;
      
      //compare
      if (hashedPassword !== undefined) {
        const match = await bcrypt.compare(password, hashedPassword);

        console.log('Login attempt by:', username);

        if (match) {
          console.log('Logged in:', username);
          req.session.authenticated = true;
          //stored it as a session variable
          req.session.username = username;
          res.redirect('/afterauth');
        } 
        else {
          console.log('Login failed for user:', username);
          res.render('loginfail.html');
        }
      } else {
        console.log('Login failed for user:', username);
        res.render('loginfail.html');
      }
    } 
    else {
      console.log('User not found:', username);
      res.render('loginfail.html');
    }
  } 
  catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error womp womp');
  } 
  finally {
    closeDatabaseConnection();
  }
});

//simple table update for username
app.post('/forgotuser', async (req, res) => {
  const { username, email } = req.body;

  try {
    await connectToDatabase();
    const result = await sql.query`UPDATE Users SET username = ${username} WHERE email = ${email}`;

    if (result.rowsAffected[0] > 0) {
      console.log('Username updated successfully.');
      res.redirect('/afterauth');
    } 
    else {
      console.log('No such email exists.');
      res.render('loginfail.html');
    }
  } 
  catch (err) {
    console.error('SQL error:', err.message);
    res.status(500).send('Internal Server Error');
  } 
  finally {
    closeDatabaseConnection();
  }
});

//same as update user just for password
app.post('/forgotpass', async (req, res) => {
  const { password, email } = req.body;

  try {
    await connectToDatabase();

    const hashedPassword = await hashPassword(password);

    const result = await sql.query`UPDATE Users SET password = ${hashedPassword} WHERE email = ${email}`;

    console.log(result);

    if (result.rowsAffected[0] > 0) {
      console.log('Password updated successfully.');
      res.redirect('/afterauth');
    }
    else {
      console.log('User not found or username not updated.');
      res.render('loginfail.html');
    }
  } 
  catch (err) {
    console.error('SQL error:', err.message);
    res.status(500).send('Internal Server Error');
  } 
  finally {
    closeDatabaseConnection();
  }
});

//way to delete accounts
app.get('/delete', async (req, res) => {

  if (req.session.authenticated) {
    const deletedUsername = req.session.username;

    try {
      await sql.connect(config);

      const result = await sql.query`DELETE FROM users WHERE username = ${deletedUsername}`;

      if (result.rowsAffected[0] > 0) {
        //destroy the session after deletion
        req.session.destroy((err) => {
          if (err) {
            console.error('Error destroying session:', err);
            res.status(500).send('Internal Server Error');
            return;
          }

          res.redirect('/preauth');
        });
      } 
      else {
        res.status(404).send('User not found');
      }
    } 
    catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).send('Internal Server Error');
    } 
    finally {
      await sql.close();
    }
  } else {
    res.redirect('/login');
  }
});

//temp 
app.get('/read', async (req, res) => {
  try {
    await sql.connect(config);
    const result = await sql.query`SELECT username, email, password, profileimg FROM Users`;

    // const result = await sql.query`SELECT username, email, password, profileimg FROM Users where username = ${req.session.username}`;
    const accounts = result.recordset;

    const ejsFilePath = path.resolve(__dirname, 'templates', 'tempread.ejs');
    res.render(ejsFilePath, { accounts: accounts });
  } 
  catch (error) {
    console.error('Error reading accounts:', error);
    res.status(500).send('Internal Server Error');
  } 
  finally {
    await sql.close();
  }
});

//linking routes to pages
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'login.html')));
app.get('/loginfail', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'loginfail.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'register.html')));
app.get('/forgotpass', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'forgotpass.html')));
app.get('/forgotuser', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'forgotuser.html')));
app.get('/preauth', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'preauth.ejs')));
app.get('/useraccount', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'useraccount.html')));





//home after authentication
app.get('/afterauth', (req, res) => {
  if (req.session.authenticated) {
    const filePath = path.join(__dirname, 'templates', 'afterauth.ejs');
    const username = req.session.username;

  res.render('afterauth', { username: username });
  } 
  else {
    res.redirect('/login');
  }
});


app.get('/logout', (req, res) => {
  req.session.authenticated = false;
  const filePath = path.join(__dirname, 'templates', 'preauth.ejs');
  res.render(filePath);
});


//run server
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
  } 
  catch (error) {
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
    } 
    else {
      console.log('No items in the playlist.');
      return null;
    }
  } 
  catch (error) {
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
      } 
      else {
        console.log(`No video found for query: ${video}`);
      }
    } 
    catch (error) {
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
  } 
  catch (error) {
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

    //retrieve playlist ID from the request body
    const spPlaylistId = req.body.spPlaylistId;

    //check if spPlaylistId is present
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
    } 
    else {
      console.log('Failed to create YouTube playlist.');
      res.status(500).send('Failed to create YouTube playlist.');
    }
  } 
  catch (error) {
    console.error(`Error in button click handler: ${error.message}`);
    res.status(500).send('An error occurred.');
  }
});