$(document).ready(function() {
    $('#loginForm').submit(function(event) {
      event.preventDefault();
      
      const email = $('#email').val().trim();
      if (!email) {
        alert("Please enter your email");
        return;
      }

      // Save the email in localStorage
      localStorage.setItem('userEmail', email);
      
      // Redirect to the projects page
      window.location.href = '/projects'; // Redirect to the projects page
    });
  });