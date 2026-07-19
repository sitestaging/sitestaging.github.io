window.addEventListener('load', function() {
  setTimeout(function() {console_text('Raphael Karger', 'text', 'white')}, 2400)
})

function console_text(txt, id, color) {
  var visible = true;
  var con = document.getElementById('console');
  var target = document.getElementById(id)
  var i = 0
  target.setAttribute('style', 'color:' + color)

  function typeWriter() {
      if (i < txt.length) {
          target.innerHTML += txt.charAt(i);
          i++;
          setTimeout(typeWriter, 218);
      }
  }
  typeWriter()
  window.setInterval(function() {
      visible = !visible;
      con.className = visible ? 'console-underscore' : 'console-underscore hidden';
  }, 400)
}
