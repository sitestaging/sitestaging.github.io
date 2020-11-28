window.addEventListener('load', function() {
  setTimeout(function() {console_text('Raphael Karger', 'text', 'white')}, 2600)
})

function console_text(txt, id, color) {
  var visible = true;
  var con = document.getElementById('console');
  var waiting = false;
  var target = document.getElementById(id)
  var i = 0
  target.setAttribute('style', 'color:' + color)

  function typeWriter() {
      if (i < txt.length) {
          waiting = false;
          target.innerHTML += txt.charAt(i);
          i++;
          setTimeout(typeWriter, 218);
          waiting = true;
      }
  }
  typeWriter()
  window.setInterval(function() {
      if (visible === true) {
          if (waiting) {
              con.className = 'console-underscore hidden'
              visible = false;
          }
      } else {
          con.className = 'console-underscore'

          visible = true;
      }
  }, 400)
}