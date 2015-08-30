var False = {
};

window.onload = function () {
  var sourceCode = document.getElementById('sourceCode'),
      codeInputContainer = document.getElementById('codeInputContainer'),
      codeInput = document.getElementById('codeInput');
  console.log(sourceCode.offsetWidth, sourceCode.clientWidth);
  console.log(codeInputContainer.offsetWidth, codeInputContainer.clientWidth);
  console.log(codeInput.offsetWidth, codeInput.clientWidth);
  //codeInput.style.width = sourceCode.offsetWidth + 'px';
};
