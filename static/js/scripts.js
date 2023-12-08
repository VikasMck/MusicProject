
//resposive
function myFunction() {
  var x = document.getElementById("navDemo");
  if (x.className.indexOf("w3-show") == -1) {
    x.className += " w3-show";
  } 
  else { 
    x.className = x.className.replace(" w3-show", "");
  }
}



//if user cant click x, click anywhere
var loginRegisterModal = document.getElementById('loginRegisterModal');
var ticketModal = document.getElementById('ticketModal');
window.onclick = function(event) {
  if (event.target == loginRegisterModal) {
    loginRegisterModal.style.display = "none";
  }
  if (event.target == ticketModal) {
    ticketModal.style.display = "none";
  }
}


function w3_open() {
  document.getElementById("mySidebar").style.display = "block";
  document.getElementById("myOverlay").style.display = "block";
}

function w3_close() {
  document.getElementById("mySidebar").style.display = "none";
  document.getElementById("myOverlay").style.display = "none";
}

function addToFavorites(songTitle, songAuthor, songImage) {
  fetch('/favorite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ songTitle, songAuthor, songImage }),
  })
  .then(response => {
    if (response.ok) {
      console.log('Song added to favorites!');
      alert('Song added to favorites!');
    } 
    else {
      console.error('Failed to add song to favorites');
      alert('Song already added to favorites!');
    }
  })
  .catch(error => {
    console.error('Error adding song to favorites:', error.message);
  });
}


function unfavorite(songTitle, songAuthor) {
  fetch('/unfavorite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ songTitle, songAuthor }),
  })
  .then(response => {
    if (response.ok) {
      console.log('Song removed from favorites!');
    } 
    else {
      console.error('Failed to remove song from favorites');
    }
  })
  .catch(error => {
    console.error('Error removing song from favorites:', error.message);
  });
}