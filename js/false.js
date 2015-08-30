var False = {
};

window.onload = function () {
  var sourceCodeContainer = document.getElementById('sourceCode'),
      sourceCode = document.getElementById('sourceCode'),
      codeInput = document.getElementById('codeInput'),
      gap = codeInput.offsetWidth - sourceCode.clientWidth;
  console.log(sourceCodeContainer.offsetWidth, sourceCodeContainer.clientWidth);
  console.log(sourceCode.offsetWidth, sourceCode.clientWidth);
  console.log(codeInput.offsetWidth, codeInput.clientWidth);
  console.log(gap);
  console.log(codeInput.offsetWidth, codeInput.clientWidth);
  function setWidth() {
    codeInput.style.width = sourceCode.clientWidth - gap + 'px';
  }
  setWidth();
  window.onresize = setWidth;
};
