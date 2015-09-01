var False = {
  types: {
    integer: 'integer',
    character: 'character',
    boolean: 'boolean'
  }
};

False.removeChildren = function (container) {
  var children = container.children;
  for (var i = children.length - 1; i >= 0; --i) {
    container.removeChild(children[i]);
  }
};

False.clearStack = function () {
  False.stack = [];
  False.removeChildren(False.stackContainer);
};

False.push = function (item) {
  False.stack.push(item);
  var container = document.createElement('div');
  container.className = 'item';
  container.innerHTML = '<span class="type">' + item.type + '</span>' +
      ' <span class="value">' + item.value + '</span>';
  item.container = container;
  False.stackContainer.appendChild(container);
};

False.pop = function () {
  if (False.stack.length == 0) {
    False.error('the stack is empty');
  } else {
    var item = False.stack.pop();
    False.stackContainer.removeChild(item.container);
    return item;
  }
};

False.error = function (s) {
  False.message('error: ' + s, 'error');
  False.crash = true;
};

False.clearMessages = function () {
  False.removeChildren(False.output);
};

False.message = function (s, classExtra) {
  var container = document.createElement('div');
  container.className = 'message ' + (classExtra || undefined);
  container.innerHTML = s;
  False.output.appendChild(container);
};

False.makeInteger = function (intValue) {
  return { type: False.types.integer, value: intValue };
};
False.makeCharacter = function (charValue) {
  return { type: False.types.character, value: charValue };
};
False.makeBoolean = function (boolValue) {
  return { type: False.types.boolean, value: boolValue };
};

False.getIntegerValue = function (item) {
  if (typeof(item) != 'object' || item.type != False.types.integer) {
    False.error('expected an integer');
  } else {
    return item.value;
  }
};
False.getBooleanValue = function (item) {
  if (typeof(item) != 'object' || item.type != False.types.boolean) {
    False.error('expected a boolean');
  } else {
    return item.value;
  }
};

False.processToken = function (token) {
  // Integer value.
  if (token.search(/^[0-9]$/) === 0) {
    False.push(False.makeInteger(parseInt(token, 10)));
    return;
  }

  // Character value.
  if (token.search(/^'[A-Z]$/) === 0) {
    False.push(False.makeCharacter(token.charAt(1)));
    return;
  }

  // Arithmetic operators.
  if (token.length == 1 && '+-*/_=>'.indexOf(token) != -1) {
    var b = False.getIntegerValue(False.pop());
    if (token == '_') {
      False.push(False.makeInteger(-b));
      return;
    }
    var a = False.getIntegerValue(False.pop());
    if (token == '+') {
      False.push(False.makeInteger(a + b));
    } else if (token == '-') {
      False.push(False.makeInteger(a - b));
    } else if (token == '*') {
      False.push(False.makeInteger(a * b));
    } else if (token == '/') {
      var ratio = a / b,
          result = (ratio < 0 ? Math.ceil : Math.floor)(ratio);
      False.push(False.makeInteger(result));
    } else if (token == '=') {
      False.push(False.makeBoolean(a === b));
    } else if (token == '>') {
      False.push(False.makeBoolean(a > b));
    }
    return;
  }

  // Logical operators.
  if (token.length == 1 && '&|~'.indexOf(token) != -1) {
    var b = False.getBooleanValue(False.pop());
    if (token == '~') {
      False.push(False.makeBoolean(!b));
      return;
    }
    var a = False.getBooleanValue(False.pop());
    if (token == '&') {
      False.push(False.makeBoolean(a & b));
    } else if (token == '-') {
      False.push(False.makeInteger(a | b));
    }
    return;
  }

  // Inequality operator.
  if (token == '=~') {
    var b = False.pop(), a = False.pop();
    // Check for strict equality.
    if (a.type === b.type && a.value === b.value) {
      False.push(False.makeBoolean(false));
      return;
    }
    // Coerce characters to integers.
    if (a.type === False.types.character) {
      a.type = 'integer';
      a.value = a.value.charCodeAt(0);
    }
    if (b.type === False.types.character) {
      b.type = 'integer';
      b.value = b.value.charCodeAt(0);
    }
    False.push(False.makeBoolean(a.type !== b.type || a.value !== b.value));
    return;
  }

  False.error('invalid token "' + token + '"');
};

False.run = function () {
  False.clearMessages();
  False.message('running');
  False.clearStack();

  // Tokenize the source code.
  var source = False.sourceInput.value;
  // Trim whitespace from ends.
  source = source.replace(/^\s+|\s$/g, '');
  // Discard line-terminating characters.
  source = source.replace(/\s/g, ' ');
  var tokens = source.split(/\s+/);

  for (var tokenIx = 0; tokenIx < tokens.length; ++tokenIx) {
    var token = tokens[tokenIx];
    console.log('token ' + tokenIx + ': ' + token);
    False.processToken(token);
    if (False.crash) {
      console.log('crashed');
      break;
    }
  }
};

window.onload = function () {
  False.output = document.getElementById('output');
  False.stackContainer = document.getElementById('stackContainer');
  var sourceInput = False.sourceInput = document.getElementById('sourceInput'),
      runButton = document.getElementById('runButton');
  sourceInput.value = " 'X 'X =~ ~ 3 3 + 6 =~ ";
  False.run();
  runButton.onclick = False.run;
};
