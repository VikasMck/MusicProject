
//resposive
function myFunction() {
  var x = document.getElementById("navDemo");
  if (x.className.indexOf("w3-show") == -1) {
    x.className += " w3-show";
  } else { 
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
