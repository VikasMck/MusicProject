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
const base64 = require('base-64');
require('dotenv').config();

const app = express();
const port = 9999; //yes
let temp = 0;


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


const allSongs = [
];


// navigation 

app.get(['/', '/preauth'], (req, res) => {
  const filePath = 'preauth';

  //render the ejs so it stops downloading
  res.render(filePath, { allSongs: allSongs }, (err, html) => {
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
  const { username, password, bio, email, userimage } = req.body;
 
  try {
    await connectToDatabase();
    const hashedPassword = await hashPassword(password);
    await sql.query`INSERT INTO Users (username, email, Password) VALUES (${username}, ${email}, ${hashedPassword})`;
    req.session.authenticated = true;
    //stored it as a session variable
    req.session.username = username;
    req.session.userimage = userimage;
    req.session.bio = bio;
    req.session.email = email;

    const checkTableQuery = `
      select count(*) as tableExists
      from information_schema.tables
      where table_name = N'${username}_basket' and table_schema = 'dbo';
    `;

    const tableCheckResults = await sql.query(checkTableQuery);
    const tableExistsCount = tableCheckResults.recordset[0].tableExists;



    console.log(checkTableQuery)
    console.log(tableCheckResults)

    if (tableExistsCount === 0) {
      const createTableQuery = `
        create table ${username}_basket (
          songid int identity(1,1) primary key,
          songtitle varchar(255) null,
          songauthor varchar(255) null,
          songdate varchar(255) null
        )
      `;
      await sql.query(createTableQuery);
      console.log(`Table '${username}_basket' created.`);
    }

    res.redirect('/afterauth');

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
    const result = await sql.query`SELECT password, email, username, userimage, bio FROM Users WHERE username = ${username}`;

    //checks if there is at least one row with the asked entry in the table
    if (result.recordset.length > 0) {
      const hashedPassword = result.recordset[0].password;
      const userimage = result.recordset[0].userimage;
      const bio = result.recordset[0].bio;
      const email = result.recordset[0].email;
      
      //compare
      if (hashedPassword !== undefined) {
        const match = await bcrypt.compare(password, hashedPassword);

        console.log('Login attempt by:', username);

        if (match) {
          console.log('Logged in:', username);
          req.session.authenticated = true;
          //stored it as a session variable
          req.session.username = username;
          req.session.userimage = userimage;
          req.session.bio = bio;
          req.session.email = email;
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

app.post('/updateprofile', async (req, res) => {
  if (req.session.authenticated) {
    const { userimage, username, email, bio, password } = req.body;

    try {
      await connectToDatabase();

      if (userimage !== undefined && userimage !== '') {
        const result = await sql.query`UPDATE Users SET userimage = ${userimage} WHERE email = ${req.session.email}`;
        if (result.rowsAffected[0] > 0) {
          req.session.userimage = userimage;
          console.log('Profile image updated successfully.');
        }
      }

      if (username !== undefined && username !== '') {
        const result = await sql.query`UPDATE Users SET username = ${username} WHERE email = ${req.session.email}`;
        if (result.rowsAffected[0] > 0) {
          req.session.username = username;
          console.log('Username updated successfully.');
        }
      }

      if (email !== undefined && email !== '') {
        const result = await sql.query`UPDATE Users SET email = ${email} WHERE email = ${req.session.email}`;
        if (result.rowsAffected[0] > 0) {
          req.session.email = email;
          console.log('Email updated successfully.');
        }
      }

      if (bio !== undefined && bio !== '') {
        const result = await sql.query`UPDATE Users SET Bio = ${bio} WHERE username = ${req.session.username}`;
        if (result.rowsAffected[0] > 0) {
          req.session.bio = bio;
          console.log('Bio updated successfully.');
        }
      }

      if (password !== undefined && password !== '') {
        const hashedPassword = await hashPassword(password);

        const result = await sql.query`UPDATE Users SET password = ${hashedPassword} WHERE email = ${req.session.email}`;
        if (result.rowsAffected[0] > 0) {
          console.log('Password updated successfully.');
        }
      }

      console.log('Profile updated successfully');
      res.redirect('/useraccount');

    } 
    catch (err) {
      console.error('SQL error:', err.message);
      res.status(500).send('Internal Server Error');
    } 
    finally {
      closeDatabaseConnection();
    }
  }
  else {
    res.redirect('/login');
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
  if (req.session.authenticated) {
    try {
      await sql.connect(config);
      const result = await sql.query`SELECT username, email, password, bio, userimage FROM Users`;

      const accounts = result.recordset;

      const ejsFilePath = path.resolve(__dirname, 'templates', 'tempread.ejs');
      res.render(ejsFilePath, { accounts: accounts });
    } catch (error) {
      console.error('Error reading accounts:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      await sql.close();
    }
  }
  else {
    res.redirect('/login');
  }
});

//linking routes to pages
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'login.html')));
app.get('/loginfail', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'loginfail.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'register.html')));
app.get('/forgotpass', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'forgotpass.html')));
app.get('/forgotuser', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'forgotuser.html')));
app.get('/preauth', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'preauth.ejs')));
app.get('/updateprofile', (req, res) => res.sendFile(path.join(__dirname, 'templates', 'updateprofile.html')));




//this will be appended with personal songs for each indiviual users into a table "{req.session.username}_table"
const personalSongs = [];




//home after authentication
app.get('/afterauth', (req, res) => {
  if (req.session.authenticated) {
    path.join(__dirname, 'templates', 'afterauth.ejs');
    const username = req.session.username;


  // res.render('afterauth', { username: username });
  res.render('afterauth', {allSongs:allSongs, username: username});

  } 
  else {
    res.redirect('/login');
  }
});


//function renders page
const renderPage = (res, currentPage, username, userimage, bio) => {
  
  //6 items per page; can be more
  const itemsPerPage = 6;
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const currentSongs = personalSongs.slice(startIdx, endIdx);
  const totalPages = Math.ceil(personalSongs.length / itemsPerPage);

  res.render('useraccount', { personalSongs: currentSongs, totalPages, currentPage, username, userimage, bio });
};

//main route
app.get('/useraccount', (req, res) => {
  if (req.session.authenticated) {
    const username = req.session.username;
    const userimage = req.session.userimage;
    const bio = req.session.bio;
    const currentPage = 1;

    renderPage(res, currentPage, username, userimage, bio);
  } 
  else {
    res.redirect('/login');
  }
});

//page stuff
app.get('/useraccount/:page', (req, res) => {
  if (req.session.authenticated) {

    const currentPage = parseInt(req.params.page);
    const username = req.session.username;
    const userimage = req.session.userimage;
    const bio = req.session.bio;

    renderPage(res, currentPage, username, userimage, bio);  
  }
  else 
    {
      res.redirect('/login');
    }
});

//for looking up usernames in realtime
app.post('/checkusername', (req, res) => {
  const enteredUsername = req.body.username;
  const sessionUsername = req.session.username; 

  if (enteredUsername === sessionUsername) {
    res.json({ match: true });
  } else {
    res.json({ match: false });
  }
});


app.get('/logout', (req, res) => {
  req.session.authenticated = false;
  const filePath = path.join(__dirname, 'templates', 'preauth.ejs');
  res.render(filePath, { allSongs: allSongs }, (err, html) => {
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
        const image = track.album.images[0].url;
        const fullName = `${songName} by   ${artists} image ${image}`;
        console.log(track);
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

  console.log("these are the video ids: ")
  console.log(videoIds)

  return videoIds;
}

function addOrUpdateSong(allSongs, formattedSongTitle, formattedSongAuthor, songImage) {
  // Check if an object with the same title and author already exists
  const existingSongIndex = allSongs.findIndex(song => song.songtitle === formattedSongTitle && song.songauthor === formattedSongAuthor);

  if (existingSongIndex !== -1) {
    // Object with the same title and author already exists, you can choose to skip or update
    console.log(`Song with title '${formattedSongTitle}' and author '${formattedSongAuthor}' already exists.`);
    // You can update the existing entry here if needed
  } else {
    // Object does not exist, push the new entry
    allSongs.push({
      src: songImage,
      alt: 'Photo', // You can customize this if needed
      songtitle: formattedSongTitle,
      songauthor: formattedSongAuthor,
    });


    //Temp
    // allSongs.push({
    //   src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Temp_plate.svg/601px-Temp_plate.svg.png',
    //   alt: 'Photo', // You can customize this if needed
    //   songtitle: 'title',
    //   songauthor: 'title',
    // })
    // allSongs.push({
    //   src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Temp_plate.svg/601px-Temp_plate.svg.png',
    //   alt: 'Photo', // You can customize this if needed
    //   songtitle: 'title1',
    //   songauthor: 'title1',
    // })
  }
}


// Add a new endpoint for handling favorite requests
app.post('/favorite', (req, res) => {
  try {
    const { songTitle, songAuthor, songImage } = req.body;

    // Check if the song is already in personalSongs
    const existingSongIndex = personalSongs.findIndex(song => song.songtitle === songTitle && song.songauthor === songAuthor);

    if (existingSongIndex === -1) {
      // Add the song to personalSongs
      personalSongs.push({
        src: songImage,
        alt: 'Photo',
        songtitle: songTitle,
        songauthor: songAuthor,
        // Add other properties as needed
      });



      console.log(`Song '${songTitle}' by '${songAuthor}' added to favorites.`);
      res.status(200).json({ message: 'Song added to favorites.' });
    } else {
      console.log(`Song '${songTitle}' by '${songAuthor}' already exists in favorites.`);
      res.status(200).json({ message: 'Song already in favorites.' });
    }
  } catch (error) {
    console.error(`Error in /favorite endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Add this new endpoint in your Node.js server
app.post('/unfavorite', (req, res) => {
  try {
    const { songTitle, songAuthor } = req.body;

    // Find the index of the song in personalSongs
    const songIndex = personalSongs.findIndex(song => song.songtitle === songTitle && song.songauthor === songAuthor);

    if (songIndex !== -1) {
      // Remove the song from personalSongs
      personalSongs.splice(songIndex, 1);

      console.log(`Song '${songTitle}' by '${songAuthor}' removed from favorites.`);
      res.status(200).json({ message: 'Song removed from favorites.' });
    } else {
      console.log(`Song '${songTitle}' by '${songAuthor}' not found in favorites.`);
      res.status(200).json({ message: 'Song not found in favorites.' });
    }
  } catch (error) {
    console.error(`Error in /unfavorite endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Search endpoint
app.get('/search', (req, res) => {
  const { songName, artist } = req.query;

  // Implement your search logic here
  const searchResults = allSongs.filter(song =>
      song.songtitle.toLowerCase().includes(songName.toLowerCase()) &&
      song.songauthor.toLowerCase().includes(artist.toLowerCase())
  );

  // Render the search results
  res.render('songList', { allSongs: searchResults });
});


app.post('/convert', async (req, res) => {
  try {
    const spClientId = process.env.SP_CLIENT_ID;
    const spClientSecret = process.env.SP_CLIENT_SECRET;
    const ytApiKey = process.env.YT_API_KEY;
    const spPlaylistId = req.body.spPlaylistId;

    const token = await getToken(spClientId, spClientSecret);

    const songs = await getPlaylistItems(token, spPlaylistId);
    console.log(songs);

    songs.forEach(song => {
      // Split the song and author
      const [songTitle, songPart] = song.split(' by ');
      const [songAuthor, songImage] = songPart.split(' image ');
    
      // Remove 'by' from the song title
      const formattedSongTitle = songTitle.replace(' by ', '');

      const formattedSongAuthor = songAuthor.replace(' image ', '');
    
      // Call the function to add or update the song
      addOrUpdateSong(allSongs, formattedSongTitle, formattedSongAuthor, songImage);
    });

    console.log(allSongs)

    const modifiedSongs = songs.map(song => {
      // Use regular expression to remove 'image' and URL
      const modifiedSong = song.replace(/image\s[^ ]+/g, '');
    
      // Remove extra whitespaces
      return modifiedSong.trim();
    });

    const videoIds = await getVideoIds(ytApiKey, modifiedSongs);
    // Send the videoIds array to the frontend
    res.json({ videoIds });
  } catch (error) {
    console.error(`Error in /convert endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

//run server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
