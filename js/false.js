var False = {};

False.option = {
  type: { coercion: true },
  stack: { scrollDown: true },
  step: { limit: 1000 },
  visual: { hertz: 8 }
};

False.state = {
  current: 'edit',  // or 'run'
  run: {
    visual: true,
    singleStep: false
  },
  halt: 'running'  // or 'input' or 'error'
};

False.step = {
  counter: -1
};

False.lexical = {
  value: {
    integer: 'integer value',
    character: 'character value',
    string: 'string value'
  },
  variable: {
    name: 'variable name'
  },
  operator: {
    arithmetic: 'arithmetic operator',
    comparison: 'comparison operator',
    logical: 'logical operator',
    variable: 'variable operator',
    stack: 'stack operator',
    control: 'control operator',
    io: 'I/O operator',
    lambda: 'lambda operator'
  },
  delimiter: {
    lambda: {
      open: 'open lambda',
      close: 'close lambda'
    },
    string: {
      open: 'open string',
      close: 'close string'
    }
  },
  comment: 'comment', 
  error: {
    character: 'character error',
    string: 'string error',
    comment: 'comment error',
    invalid: 'invalid'
  }
};

// Prepare dictionaries that help with tokenizing and parsing.
(function () {
  // Map characters to token descriptors.
  var lexical = False.lexical,
      lookup = False.lookup = {},
      operator = lexical.operator,
      delimiter = lexical.delimiter;
  var fill = function(s, name) {
    s.split('').forEach(function (ch) {
      lookup[ch] = name;
    });
  };
  fill('+-*/_', operator.arithmetic);
  fill('=>', operator.comparison);
  fill('&|~', operator.logical);
  fill(':;', operator.variable);
  fill('$%\\@ø', operator.stack);
  fill('?#', operator.control);
  fill('.,^ß', operator.io);
  fill('[', delimiter.lambda.open);
  fill(']', delimiter.lambda.close);
  fill('!', operator.lambda);
  var range = function (firstChar, lastChar, name) {
    var last = lastChar.charCodeAt(0);
    for (var i = firstChar.charCodeAt(0); i <= last; ++i) {
      lookup[String.fromCharCode(i)] = name;
    }
  };
  range('a', 'z', lexical.variable.name);

  // Map token descriptors to token category hierarchy.
  var categoryOf = False.categoryOf = {};
  var descend = function (group, levels) {
    Object.keys(group).forEach(function (key) {
      var item = group[key];
      levels.push(key);
      if (typeof(item) === 'string') {
        categoryOf[item] = levels.slice();
      } else {
        descend(item, levels);
      }
      levels.pop();
    });
  };
  descend(lexical, []);

  // Decide which tokens will be retained for parsing.
  var parseToken = False.parseToken = {};
  ['value', 'variable', 'operator'].forEach(function (category) {
    parseToken[category] = true;
  });
})();

False.makeToken = function (descriptor, outBegin, outEnd, inBegin, inEnd) {
  if (inBegin === undefined) {
    inBegin = outBegin;
    inEnd = outEnd;
  }
  return {
    descriptor: descriptor,
    outer: { begin: outBegin, end: outEnd },
    inner: { begin: inBegin, end: inEnd }
  };
};

False.makeScanError = function (token, message) {
  return { token: token, message: message };
};

False.scan = function (s) {
  var result = {},
      tokens = result.tokens = [],
      errors = result.errors = [],
      makeToken = False.makeToken,
      makeScanError = False.makeScanError,
      lexical = False.lexical,
      lookup = False.lookup,
      pos = 0;
  while (pos < s.length) {
    var ch = s.charAt(pos);
    ++pos;
    if (/\s/.test(ch)) {
      continue;
    }

    // Single character: operator, lambda delimiter, or variable name.
    var lookupResult = lookup[ch];
    if (lookupResult !== undefined) {
      tokens.push(makeToken(lookupResult, pos - 1, pos));
      continue;
    }

    // Sequence of digits: integer value.
    if (/[0-9]/.test(ch)) {
      var seek = pos;
      while (seek < s.length && /[0-9]/.test(s.charAt(seek))) {
        ++seek;
      }
      tokens.push(makeToken(lexical.value.integer, pos - 1, seek));
      pos = seek;
      continue;
    }

    // Single quote followed by any character: character value.
    if (ch == "'") {
      if (pos < s.length) {
        tokens.push(makeToken(lexical.value.character, pos - 1, pos + 1,
            pos, pos + 1));
        ++pos;
        continue;
      } else {
        tokens.push(makeToken(lexical.error.character, pos - 1, pos));
        errors.push(makeScanError(tokens[tokens.length - 1],
            'missing character'));
        break;
      } 
    }

    // Double-quoted character sequence: string.
    if (ch == '"') {
      var seek = pos;
      while (true) {
        if (seek == s.length) {
          tokens.push(makeToken(lexical.error.string, pos - 1, seek));
          errors.push(makeScanError(tokens[tokens.length - 1],
              'string not terminated'));
          pos = seek;
          break;
        }
        ch = s.charAt(seek);
        ++seek;
        // Check for an escaped double quote.
        if (ch == '\\' && seek < s.length && s.charAt(seek) == '"') {
          ++seek;
          continue;
        }
        // Check for the end of the string.
        if (ch == '"') {
          tokens.push(makeToken(lexical.value.string, pos - 1, seek,
              pos, seek - 1));
          pos = seek;
          break;
        }
      }
      continue;
    }

    // Left brace + any characters except right brace + right brace: comment.
    // Note that comments cannot be nested.
    if (ch == '{') {
      var seek = pos;
      while (true) {
        if (seek == s.length) {
          tokens.push(makeToken(lexical.error.comment, pos - 1, seek));
          errors.push(makeScanError(tokens[tokens.length - 1],
              'comment not terminated'));
          pos = seek;
          break;
        }
        ch = s.charAt(seek);
        ++seek;
        if (ch == '}') {
          tokens.push(makeToken(lexical.comment, pos - 1, seek));
          pos = seek;
          break;
        }
      }
      continue;
    }

    // If we didn't recognize the character, it's a syntax error.
    tokens.push(makeToken(lexical.error.invalid, pos - 1, pos));
    errors.push(makeScanError(tokens[tokens.length - 1],
        'invalid token'));
  }
  return result;
};

False.makeParseError = function (pos, message) {
  return { pos: pos, message: message };
};

False.doParse = function (errors, tokens, startLambda) {
  var lexical = False.lexical,
      categoryOf = False.categoryOf,
      parseToken = False.parseToken,
      pos = startLambda || 0,
      tree = {
        category: (startLambda ? 'lambda' : 'program'),
        beginToken: (startLambda ? pos - 1 : pos),
      },
      children = tree.children = [],
      makeParseError = False.makeParseError,
      delimiter = lexical.delimiter.lambda;
  if (tokens.length == 0) {
    errors.push(makeParseError(null, 'no tokens'));
    return tree;
  }
  while (true) {
    if (pos == tokens.length) {  // We've run out of tokens.
      tree.endToken = pos;
      if (startLambda !== undefined) {  // We are inside a lambda function.
        errors.push(makeParseError(tree.beginToken,
            'lambda function not closed'));
      }
      break;
    }
    if (tokens[pos].descriptor === delimiter.close) {  // Close lambda.
      if (startLambda === undefined) {  // We are not in a lambda function.
        errors.push(makeParseError(pos, 'unexpected lambda delimiter'));
        ++pos;
        continue;  // Skip the token and continue parsing.
      }
      tree.endToken = pos + 1;
      break;
    }
    var descriptor = tokens[pos].descriptor;
    if (descriptor === delimiter.open) {  // Descend into a lambda function.
      var lambda = False.doParse(errors, tokens, pos + 1);
      children.push(lambda);  // The lambda is a child of the current tree.
      pos = lambda.endToken;
      continue;
    }
    // If the token is meaningful, add it as a child.
    var category = categoryOf[descriptor][0];
    if (parseToken[category]) {
      var node = {
        category: category,
        token: tokens[pos]
      };
      children.push(node);
    }
    ++pos;
  }
  tree.begin = tokens[tree.beginToken].outer.begin;
  tree.end = tokens[tree.endToken - 1].outer.end;
  return tree;
};

False.parse = function (tokens) {
  var errors = [],
      tree = False.doParse(errors, tokens);
  return { tree: tree, errors: errors };
};

False.displayParseTree = function (tree, tabs) {
  tabs = tabs || [];
  var indent = tabs.join('');
  console.log(indent + tree.category + ': token ' + tree.beginToken +
      ' to token ' + tree.endToken);
  tabs.push('    ');
  tree.children.forEach(function (child) {
    if (child.category === 'lambda') {
      console.log(child.category);
      False.displayParseTree(child, tabs);
    } else {
      var token = child.token;
      console.log(indent + child.category + ', ' + token.descriptor + ', ' +
          'character ' + token.outer.begin +' to character '+ token.outer.end);
    }
  });
  tabs.pop();
};

False.highlight = function(token) {
  sourceInput.selectionStart = token.outer.begin;
  sourceInput.selectionEnd = token.outer.end;
};

False.copyItem = function (item) {
  return { type: item.type, value: item.value };
};
False.makeLambdaItem = function (node) {
  return { type: 'lambda', value: node };
};
False.makeIntegerItem = function (x) {
  return { type: 'integer', value: x };
};
False.makeBooleanItem = function (b) {
  return { type: 'boolean', value: b };
}
False.makeCharacterItem = function (ch) {
  return { type: 'character', value: ch };
};
False.makeStringItem = function (s) {
  return { type: 'string', value: s };
};
False.makeVariableItem = function (name) {
  return { type: 'variable', value: name };
};

False.toInteger = function (item) {
  if (item.type === 'integer') {
    return item.value;
  }
  if (item.type === 'boolean') {
    return item.value ? -1 : 0;
  }
  if (item.type === 'character') {
    return item.value.charCodeAt(0);
  }
  return False.makeError("can't get integer from " + item.type);
};
False.toBoolean = function (item) {
  if (item.type === 'integer') {
    if (item.value != -1 && item.value != 0) {
      return False.makeError("can't get character from " + item.value);
    }
    return item.value === 0 ? false : true;
  }
  if (item.type === 'boolean') {
    return item.value;
  }
  if (item.type === 'character') {
    if (item.value.charCodeAt(0) === 0) {
      return false;
    }
    return False.makeError("can't get boolean from " + item.value);
  }
  return False.makeError("can't get boolean from " + item.type);
};
False.toCharacter = function (item) {
  if (item.type === 'integer') {
    if (item.value < 0 || item.value > 65535) {
      return False.makeError("can't get character from " + item.value);
    }
    return String.fromCharCode(item.value);
  }
  if (item.type === 'boolean') {
    if (item.value) {
      return False.makeError("can't get character from true boolean value");
    }
    return String.fromCharCode(0);
  }
  if (item.type === 'character') {
    return item.value;
  }
  return False.makeError("can't get character from " + item.type);
};
False.toLambda = function (item) {
  if (item.type !== 'lambda') {
    return False.makeError('expected a lambda function');
  }
  return item.value;
};

False.makeError = function (message) {
  return { error: message };
};
False.isError = function (result) {
  return typeof(result) === 'object' && result.error !== undefined;
};
False.makeInterrupt = function (interruptHandler) {
  return { interruptHandler: interruptHandler };
};
False.isInterrupt = function (result) {
  return typeof(result) === 'object' && result.interruptHandler !== undefined;
};

False.executeStep = function () {
  False.step.display();
  if (++False.step.counter > False.option.step.limit) {
    console.log('exceeded ' + False.option.step.limit + ' steps');
    return False.makeError('exceeded ' + False.option.step.limit + ' steps');
  }
  var callStack = False.callStack;
  if (callStack.length == 0) {
    return False.makeError('empty call stack');
  }
  var call = callStack[False.callIndex];
  if (call.step != -1) {
    M.classRemove(call.spans[call.step], 'executing');
  }
  call.step += 1;
  if (call.step == call.length) {
    if (call.isWhileCondition) {
      var outcome = False.toBoolean(False.peek());
      if (False.isError(outcome)) {
        return outcome;
      }
      False.pop();
      if (outcome) {
        call.step = -1;
        False.callIndex += 1;
        call.bodyCall.step = -1;
      } else {
        False.finishCall();
      }
    } else if (call.isWhileBody) {
      False.callIndex -= 1;
    } else {
      False.finishCall();
    }
    if (callStack.length != 0) {
      return False.executeStep();
    }
    return;
  }
  M.classAdd(call.spans[call.step], 'executing');
  var node = call.tree.children[call.step],
      lexical = False.lexical,
      operator = lexical.operator;
  // Categories: program, lambda, value, variable, operator.
  // program will never appear as a child node
  var category = node.category;
  // lambda: wrap the AST sub-tree in a stack item
  if (category === 'lambda') {
    False.push(False.makeLambdaItem(node));
    return;
  }
  var token = node.token,
      descriptor = token.descriptor,
      content = False.sourceCode.substring(token.inner.begin, token.inner.end);
  // value: append strings to output, push other values onto the stack
  if (category === 'value') {
    if (descriptor === lexical.value.string) {
      False.io.write(content);
      return;
    }
    if (descriptor === lexical.value.integer) {
      False.push(False.makeIntegerItem(parseInt(content, 10)));
      return;
    }
    if (descriptor === lexical.value.character) {
      False.push(False.makeCharacterItem(content));
      return;
    }
  }
  // variable: wrap the variable name in a stack item
  if (category === 'variable') {
    False.push(False.makeVariableItem(content));
    return;
  }
  // If no other category matched, we must be dealing with an operator.
  // Pop the required items off the stack and perform the operation.
  var symbol = content;
  // Arithmetic operators: _ + - *  /
  if (descriptor === operator.arithmetic) {
    var b = False.toInteger(False.peek());
    if (False.isError(b)) {
      return b;
    }
    if (symbol == '_') {
      False.pop();
      False.push(False.makeIntegerItem(-b));
      return;
    }
    var a = False.toInteger(False.peek(1));
    if (False.isError(a)) {
      return a;
    }
    if (symbol == '/') {
      if (b === 0) {
        return False.makeError('division by zero');
      }
      False.pop();
      False.pop();
      var ratio = a / b,
          result = (ratio < 0 ? Math.ceil : Math.floor)(ratio);
      False.push(False.makeIntegerItem(result));
      return;
    }
    False.pop();
    False.pop();
    if (symbol == '+') {
      False.push(False.makeIntegerItem(a + b));
      return;
    }
    if (symbol == '-') {
      False.push(False.makeIntegerItem(a - b));
      return;
    }
    if (symbol == '*') {
      False.push(False.makeIntegerItem(a * b));
      return;
    }
  }
  // Comparison operators: = >
  if (descriptor === operator.comparison) {
    var b = False.toInteger(False.peek());
    if (False.isError(b)) {
      return b;
    }
    var a = False.toInteger(False.peek(1));
    if (False.isError(a)) {
      return a;
    }
    var result = (symbol == '=' ? (a === b) : (a > b));
    False.pop();
    False.pop();
    False.push(False.makeBooleanItem(result));
    return;
  }
  // Logical operators: ~ & |
  if (descriptor === operator.logical) {
    var b = False.toBoolean(False.peek());
    if (False.isError(b)) {
      return b;
    }
    if (symbol == '~') {
      False.pop();
      False.push(False.makeBooleanItem(!b));
      return;
    }
    var a = False.toBoolean(False.peek(1));
    if (False.isError(a)) {
      return a;
    }
    False.pop();
    False.pop();
    if (symbol == '&') {
      False.push(False.makeBooleanItem(a && b));
      return;
    }
    if (symbol == '|') {
      False.push(False.makeBooleanItem(a || b));
      return;
    }
  }
  // Variable operators: ; :
  if (descriptor === operator.variable) {
    var item = False.peek();
    if (False.isError(item)) {
      return item;
    }
    if (item.type != 'variable') {
      return False.makeError('expected a variable');
    }
    var name = item.value;
    if (symbol == ';') {  // Retrieve from variable.
      var item = False.retrieve(name);
      if (False.isError(item)) {
        return item;
      }
      False.pop();
      False.push(item);
      return;
    }
    if (symbol == ':') {  // Store to variable.
      var item = False.peek(1);
      if (False.isError(item)) {
        return item;
      }
      var outcome = False.store(name, item);
      if (False.isError(outcome)) {
        return outcome;
      }
      False.pop();
      False.pop();
      return;
    }
  }
  // Stack operators: $ % \ @ ø
  if (descriptor === operator.stack) {
    if (symbol == '$') {  // duplicate
      var item = False.peek();
      if (False.isError(item)) {
        return item;
      }
      False.push(False.copyItem(item));
      return;
    }
    if (symbol == '%') {  // drop
      var outcome = False.pop();
      if (False.isError(outcome)) {
        return outcome;
      }
      return;
    }
    if (symbol == '\\') {  // swap
      var b = False.peek();
      if (False.isError(b)) {
        return b;
      }
      var a = False.peek(1);
      if (False.isError(a)) {
        return a;
      }
      False.pop();
      False.pop();
      False.push(b);
      False.push(a);
      return;
    }
    if (symbol == '@') {  // rotate
      var c = False.peek();
      if (False.isError(c)) {
        return c;
      }
      var b = False.peek(1);
      if (False.isError(b)) {
        return b;
      }
      var a = False.peek(2);
      if (False.isError(a)) {
        return a;
      }
      False.pop();
      False.pop();
      False.pop();
      False.push(b);
      False.push(c);
      False.push(a);
      return;
    }
    if (symbol == 'ø') {  // pick: copy nth item (zero-based)
      var n = False.toInteger(False.peek());
      if (False.isError(n)) {
        return n;
      }
      var item = False.peek(n + 1);
      if (False.isError(item)) {
        return item;
      }
      False.pop();
      False.push(False.copyItem(item));
      return;
    }
  }
  // Lambda evaluation operator: !
  if (descriptor === operator.lambda) {
    var item = False.peek();
    if (False.isError(item)) {
      return item;
    }
    if (item.type != 'lambda') {
      return False.makeError('expected a lambda function');
    }
    False.pop();
    False.startCall(item.value);
    return;
  }
  // Control operators: ? #
  if (descriptor === operator.control) {
    if (symbol == '?') {  // if: boolean lambda
      var lambda = False.toLambda(False.peek());
      if (False.isError(lambda)) {
        return lambda;
      }
      var condition = False.toBoolean(False.peek(1));
      if (False.isError(condition)) {
        return condition;
      }
      False.pop();
      False.pop();
      if (condition) {
        False.startCall(lambda);
      }
      return;
    }
    if (symbol == '#') {  // while: lambda lambda
      var bodyLambda = False.toLambda(False.peek());
      if (False.isError(bodyLambda)) {
        return bodyLambda;
      }
      var conditionLambda = False.toLambda(False.peek(1));
      if (False.isError(conditionLambda)) {
        return conditionLambda;
      }
      False.pop();
      False.pop();
      False.startCall(conditionLambda, bodyLambda);
      return;
    }
  }
  // Input/output operators: . , ^ ß
  if (descriptor === operator.io) {
    if (symbol == '.') {  // print integer
      var a = False.toInteger(False.peek());
      if (False.isError(a)) {
        return a;
      }
      False.pop();
      False.io.write('' + a);
      return;
    }
    if (symbol == ',') {  // print integer
      var c = False.toCharacter(False.peek());
      if (False.isError(c)) {
        return c;
      }
      False.pop();
      False.io.write(c);
      return;
    }
    if (symbol == '^') {
      var unscanned = False.display.input.unscanned,
          shadow = False.display.input.shadow;
      var getCharacter = function () {
        var ch = unscanned.value.charAt(0);
        False.push(False.makeCharacterItem(ch));
        unscanned.value = unscanned.value.substring(1);
        shadow.scanned.innerHTML += ch;
        False.updateInputPosition();
      };
      if (unscanned.value.length != 0) {
        getCharacter();
        return;
      }
      call.step -= 1;
      if (False.state.run.singleStep) {
        return;
      }
      return False.makeInterrupt(function (interruptContinuation) {
        unscanned.oninput = function () {
          unscanned.oninput = undefined;
          interruptContinuation();
        };
      });
    }
    if (symbol == 'ß') {
      var scanned = False.display.input.shadow.scanned.innerHTML;
      False.display.input.shadow.scanned.innerHTML = '';
      False.updateInputPosition();
      False.io.write(scanned);
      return;
    }
  }
};

False.updateInputPosition = function () {
  var unscanned = False.display.input.unscanned,
      shadow = False.display.input.shadow,
      container = False.display.input.container,
      currentOffset = M.getOffset(shadow.caret, container),
      originalOffset = shadow.caret.originalOffset,
      left = currentOffset.left - originalOffset.left,
      top = currentOffset.top - originalOffset.top;
  unscanned.style.textIndent = left + 'px';
  unscanned.style.top = top + 'px';
};

False.removeChildren = function (display) {
  var children = display.children;
  for (var i = children.length - 1; i >= 0; --i) {
    display.removeChild(children[i]);
  }
};

False.toString = function (item) {
  if (item.type === 'lambda') {
    return False.sourceCode.substring(item.value.begin, item.value.end);
  }
  return item.value;
};

False.push = function (item) {
  // Push the item onto the logical stack.
  False.stack.push(item);
  // Display a string in the physical stack.
  var type = item.type,
      display = document.createElement('div');
  display.className = 'item';
  display.innerHTML = '<div class="type">' + type + '</div>' +
      '<div class="value">' + False.toString(item) + '</div>';
  item.display = display;
  False.display.stack.appendChild(display);
};

False.pop = function () {
  if (False.stack.length == 0) {
    return False.makeError('empty stack');
  }
  var item = False.stack.pop();
  False.display.stack.removeChild(item.display);
  item.display = undefined;
  return item;
};

False.peek = function (fromTop) {
  fromTop = fromTop || 0;
  if (fromTop < 0 || fromTop >= False.stack.length) {
    return False.makeError('out of stack');
  }
  return False.stack[False.stack.length - 1 - fromTop];
};

False.store = function (name, item) {
  var info = False.variables[name];
  if (info === undefined) {
    return False.makeError('invalid variable name ' + name);
  }
  // Assume that info is { display: variable, span: { value: valueSpan } }
  // Logical storage.
  info.item = item;
  // Physical representation.
  M.classRemove(info.display, 'unused');
  info.span.value.innerHTML = False.toString(item);
};

False.retrieve = function (name) {
  var info = False.variables[name];
  if (info === undefined) {
    return False.makeError('invalid variable name ' + name);
  }
  var item = info.item;
  if (item === undefined) {
    return False.makeError('nothing stored in variable ' + name);
  }
  return False.copyItem(item);
};

False.clearStack = function () {
  False.stack = [];
  False.removeChildren(False.display.stack);
};

False.clearVariables = function () {
  Object.keys(False.variables).forEach(function (name) {
    var info = False.variables[name];
    info.item = undefined;
    M.classAdd(info.display, 'unused');
    info.span.value.innerHTML = '';
  });
};

False.io = {};
// A display is a div of divs. Each inner div contains a single span,
// the contents of which constitute one line.
False.io.clearOutputDisplay = function () {
  var display = False.display.output;
  False.removeChildren(display);
  False.io.newLine(display);
};
False.io.newLine = function (display) {
  if (display.currentOuter) {
    M.classRemove(display.currentOuter, 'current');
  }
  var lineOuter = display.currentOuter = document.createElement('div'),
      lineInner = display.currentInner = document.createElement('span'),
      lineEnd = document.createElement('span');
  M.classAdd(lineOuter, 'current');
  M.classAdd(lineEnd, 'lineEnd');
  lineEnd.innerHTML = '&nbsp;';
  if (display.children.length % 2 == 0) {
    M.classAdd(lineOuter, 'zebraFirst');
  } else {
    M.classAdd(lineOuter, 'zebraSecond');
  }
  lineOuter.appendChild(lineInner);
  lineOuter.appendChild(lineEnd);
  display.appendChild(lineOuter);
};
False.io.addText = function (display, text) {
  var lines = text.split('\n');
  for (var i = 0; i < lines.length - 1; ++i) {
    display.currentInner.innerHTML += lines[i];
    False.io.newLine(display);
  }
  display.currentInner.innerHTML += lines[lines.length - 1];
};
False.io.write = function (text) {  // Write to the output stream.
  False.io.addText(False.display.output, text);
};

False.errorMessage = function (s) {
  False.message(s, 'error');
};

False.clearMessages = function () {
  False.removeChildren(False.display.messages);
};

False.message = function (s, classExtra) {
  var display = document.createElement('div');
  display.className = 'message ' + (classExtra || undefined);
  display.innerHTML = s;
  False.display.messages.appendChild(display);
};

False.clearCallStack = function () {
  False.callStack = [];
  False.removeChildren(False.display.callStack);
};
False.startCall = function (syntaxTree, whileBody) {
  // Make an object for the logical call stack.
  var call = {
    tree: syntaxTree,
    length: syntaxTree.children.length,
    step: -1,
    isWhileCondition: false
  };
  var callIndex = False.callStack.length;
  False.callStack.push(call);
  var item = document.createElement('div');
  False.display.callStack.appendChild(item);
  if (whileBody !== undefined) {
    call.isWhileCondition = true;
    var bodyCall = call.bodyCall = False.startCall(whileBody);
    bodyCall.isWhileBody = true;
    bodyCall.whileCall = call;
  }
  False.callIndex = callIndex;
  // Make a physical representation of the call.
  var children = syntaxTree.children,
      tokens = False.scanResult.tokens,
      previousEnd = -1;
  item.className = 'item';

  var makeSpan = function (className, begin, end) {
    var span = document.createElement('span');
    span.className = className;
    span.innerHTML = False.sourceCode.substring(begin, end);
    return span;
  };

  if (syntaxTree.category == 'lambda') {
    var openDelimiter = tokens[syntaxTree.beginToken],
        begin = openDelimiter.outer.begin,
        end = openDelimiter.outer.end;
    item.appendChild(makeSpan('delimiter space', begin, end));
    previousEnd = end;
  }

  call.spans = new Array(children.length);
  for (var i = 0; i < children.length; ++i) {
    var child = children[i];
    if (child.category == 'lambda') {
      var begin = child.begin,
          end = child.end;
    } else {
      var begin = child.token.outer.begin,
          end = child.token.outer.end;
    }
    if (previousEnd != -1 && begin != previousEnd) {
      item.appendChild(makeSpan('space', previousEnd, begin));
    }
    previousEnd = end;
    var span = makeSpan('code', begin, end);
    call.spans[i] = span;
    item.appendChild(span);
  }

  if (syntaxTree.category == 'lambda') {
    var closeDelimiter = tokens[syntaxTree.endToken - 1],
        begin = closeDelimiter.outer.begin,
        end = closeDelimiter.outer.end;
    if (begin != previousEnd) {
      item.appendChild(makeSpan('space', previousEnd, begin));
    }
    item.appendChild(makeSpan('delimiter space', begin, end));
  }

  call.item = item;
  return call;
};
False.finishCall = function () {
  var call = False.callStack.pop();
  False.display.callStack.removeChild(call.item);
  if (call.isWhileBody) {
    False.finishCall();  // We have to pop the while condition too.
  }
  False.callIndex = False.callStack.length - 1;
};

False.singleStep = function () {
  if (False.state.run.error) {
    return;
  }
  if (!False.running) {
    if (!False.prepareToRun()) {
      return;
    }
    False.startRunning();
  }
  False.state.run.halted = false;
  False.state.run.singleStep = true;
  var outcome = False.executeStep();
  if (False.isError(outcome)) {
    False.errorMessage(outcome.error);
    False.state.run.error = true;
  }
  if (False.callStack.length == 0) {
    False.rewind();
    return;
  }
};

False.rewind = function () {
  False.state.run.halted = true;
  False.state.run.error = false;
  False.display.input.shadow.scanned.innerHTML = '';
  False.updateInputPosition();
  False.display.input.unscanned.value = False.io.initialInput || '';
  unscanned = False.display.input.unscanned;
  unscanned.oninput = undefined;
  False.resumeEditing();
  False.message('done');
};

False.pause = function () {
  False.state.run.halted = true;
};

False.clearRunInterface = function () {
  False.clearMessages();
  False.clearCallStack();
  False.clearStack();
  False.clearVariables();
  False.io.clearOutputDisplay();
};

False.step.display = function () {
  False.display.step.innerHTML = '<span class="label">step </span>' +
      False.step.counter;
};

False.prepareToRun = function () {
  False.clearRunInterface();
  False.io.initialInput = False.display.input.unscanned.value;
  False.step.counter = 0;
  False.step.display();
  False.makeParseTree();
  if (False.parseResult.errors.length != 0) {
    return false;
  }
  False.startCall(False.parseResult.tree);
  return true;
};

False.makeParseTree = function () {
  // Scan: characters -> tokens
  var sourceCode = False.sourceCode = False.sourceInput.value,
      scanResult = False.scanResult = False.scan(sourceCode);
  if (scanResult.errors.length != 0) {
    scanResult.errors.forEach(function (error) {
      var token = error.token,
          text = sourceCode.substring(token.outer.begin, token.outer.end);
      if (text.length > 20) {
        text = text.substring(0, 20) + '...';
      }
      False.errorMessage('[char ' + token.outer.begin + '] ' + error.message +
          ': ' + text);
    });
    return;
  }

  // Parse: tokens -> parse tree
  var tokens = scanResult.tokens,
      parseResult = False.parseResult = False.parse(tokens);
  if (parseResult.errors.length != 0) {
    parseResult.errors.forEach(function (error) {
      if (error.pos === null) {
        False.errorMessage(error.message);
        return;
      }
      var token = tokens[error.pos],
          text = sourceCode.substring(token.outer.begin, token.outer.end);
      if (text.length > 20) {
        text = text.substring(0, 20) + '...';
      }
      False.errorMessage('[char ' + token.outer.begin + '] ' + error.message +
          ': ' + text);
    });
    return;
  }
};

False.run = function () {
  if (False.state.run.error) {
    return;
  }
  if (!False.running) {
    if (!False.prepareToRun()) {
      return;
    }
    False.startRunning();
  }
  False.state.run.halted = false;
  False.state.run.singleStep = false;
  var syntaxTree = False.parseResult.tree;
  False.message('run');
  var programCall = False.callStack[0];
  var step = function () {
    if (False.state.run.halted) {
      return;
    }
    if (False.callStack.length == 0) {
      False.rewind();
      return;
    }
    var outcome = False.executeStep();
    if (False.isError(outcome)) {
      False.errorMessage(outcome.error);
      False.state.run.error = true;
      return;
    }
    if (False.isInterrupt(outcome)) {
      console.log('interrupt');
      outcome.interruptHandler(function () {
        console.log('resume');
        step();
      });
      return;
    }
    step();
  }
  step();
};

False.visualRun = function () {
  if (False.state.run.error) {
    return;
  }
  if (!False.running) {
    if (!False.prepareToRun()) {
      return;
    }
    False.startRunning();
  }
  False.state.run.halted = false;
  False.state.run.singleStep = false;
  var syntaxTree = False.parseResult.tree;
  False.message('visual run');
  var programCall = False.callStack[0],
      delay = 1000 / False.option.visual.hertz;
  var visualStep = function () {
    if (False.state.run.halted) {
      return;
    }
    if (False.callStack.length == 0) {
      False.rewind();
      return;
    }
    var outcome = False.executeStep();
    if (False.isError(outcome)) {
      False.errorMessage(outcome.error);
      False.state.run.error = true;
      return;
    }
    if (False.isInterrupt(outcome)) {
      console.log('interrupt');
      outcome.interruptHandler(function () {
        console.log('resume');
        visualStep();
      });
      return;
    }
    False.runTimeout = window.setTimeout(visualStep, delay);
  };
  visualStep();
};

False.resumeEditing = function () {
  M.classAdd(False.display.callStack, 'hidden');
  M.classRemove(False.sourceInput, 'hidden');
  False.running = false;
};

False.startRunning = function () {
  M.classRemove(False.display.callStack, 'hidden');
  M.classAdd(False.sourceInput, 'hidden');
  False.running = true;
};

window.onload = function () {
  False.display = {};
  False.display.variables = document.getElementById('variables');
  var a = 'a'.charCodeAt(0),
      z = 'z'.charCodeAt(0);
  False.variables = {};
  for (var i = a; i <= z; ++i) {
    var ch = String.fromCharCode(i),
        variable = document.createElement('div');
    variable.className = 'variable unused';
    var nameSpan = document.createElement('span'),
        valueSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.innerHTML = ch;
    valueSpan.className = 'value';
    variable.appendChild(nameSpan);
    variable.appendChild(valueSpan);
    False.display.variables.appendChild(variable);
    False.variables[ch] = { display: variable, span: { value: valueSpan } };
  }

  False.display.input = {
    container: document.getElementById('input'),
    shadow: {
      container: document.createElement('div'),
      unscanned: document.createElement('span'),
      caret: document.createElement('span'),
      scanned: document.createElement('span'),
      eof: document.createElement('span')
    },
    unscanned: document.createElement('textarea')
  };
  var container = False.display.input.container,
      shadow = False.display.input.shadow,
      unscanned = False.display.input.unscanned;
  shadow.container.id = 'shadow';
  shadow.container.className = 'display';
  shadow.scanned.className = 'scanned';
  shadow.container.appendChild(shadow.scanned);
  shadow.caret.className = 'caret';
  shadow.caret.innerHTML = '&nbsp;';
  var marker = document.createElement('span');
  marker.className = 'marker';
  marker.innerHTML = '&#x2038;';
  shadow.caret.appendChild(marker);
  shadow.container.appendChild(shadow.caret);
  shadow.unscanned.className = 'unscanned';
  shadow.container.appendChild(shadow.unscanned);
  shadow.eof.className = 'eof';
  shadow.container.appendChild(shadow.eof);
  container.appendChild(shadow.container);
  shadow.caret.originalOffset = M.getOffset(shadow.caret, container);
  marker.style.left = -1 - marker.offsetWidth / 2 + 'px';
  unscanned.id = 'unscanned';
  unscanned.className = 'display';
  unscanned.spellcheck = false;
  container.appendChild(unscanned);

  False.display.output = document.getElementById('outputDisplay');

  False.display.step = document.getElementById('stepCount');
  False.display.messages = document.getElementById('messages');
  False.display.stack = document.getElementById('stack');
  False.display.callStack = document.getElementById('callStack');

  var sourceInput = False.sourceInput = document.getElementById('sourceInput');
  False.sourceInput.spellcheck = false;
  var makeInsertHandler = function (insertText) {
    return function () {
      var text = sourceInput.value,
          start = sourceInput.selectionStart,
          end = sourceInput.selectionEnd,
          left = text.substring(0, start),
          right = text.substring(end),
          newStart = start + insertText.length;
      sourceInput.value = left + insertText + right;
      sourceInput.setSelectionRange(newStart, newStart);
      sourceInput.focus();
    };
  };
  document.getElementById('betaButton').onclick = makeInsertHandler('ß');
  document.getElementById('oslashButton').onclick = makeInsertHandler('ø');

  // Sample programs.
  sourceInput.value = '{ Conversation. }\n' +
      '"\\"Hello there.\\""\n"\\"Hi.\\""\n'+
      '{ Exeunt. }';
  sourceInput.value = "99 9[1-$][\$@$@$@$@\/*=[1-$$[%\1-$@]?0=[\$.' ,\]?]?]#";
  sourceInput.value ="[\$@$@\/+2/]r: [127r;!r;!r;!r;!r;!r;!r;!\%]s: 2000000s;!";
  sourceInput.value = "[[$' =][%^]#]b:" +
      "[$$'.=\' =|~]w:" +
      "[$'.=~[' ,]?]s:" +
      "[w;![^o;!\,]?]o:" +
      "^b;![$'.=~][w;[,^]#b;!s;!o;!b;!s;!]#,";
  sourceInput.value = '[$0=["no more bottles"]?$1=["One bottle"]?$1>[$.' +
    '" bottles"]?%" of beer"]b:' +
    '100[$0>][$b;!" on the wall, "$b;!".' +
    '"1-"Take one down, pass it around, "$b;!" on the wall.\n"]#%';
  sourceInput.value = '1 a: a; a; + $  a; + a; \\ @';
  sourceInput.value = '2 2 * 1 + ';
  sourceInput.value = '7 8 9 [ 1 + ] ! 0 ø';
  sourceInput.value = ' [ $ 1 + ] f:\n 10 1 1 = f; ? ';
  sourceInput.value = '3\n[ a; 1 - $ a: 1_ > ]\n[ \' ,a;1+.. \' ,\'h,"ello\n" ]\n@a:\n# ß';
  sourceInput.value = '^ a: "You entered: " a;,"\n"';
  sourceInput.value = '"Enter something: " 0a: [ ^ $ 10 =~ ][a;1+a:]# ß % a;$." characters\n" "reversed: " [ $ 0 = ~ ][ \\ , 1 - ]# % 10, ';
  document.getElementById('runButton').onclick = False.run;
  document.getElementById('visualRunButton').onclick = False.visualRun;
  document.getElementById('stepButton').onclick = False.singleStep;
  document.getElementById('stopButton').onclick = False.rewind;
  document.getElementById('pauseButton').onclick = False.pause;
  False.display.input.unscanned.value = 'A man, a plan, a canal, Panama.\n';
  False.visualRun();
  return;
  False.singleStep();
  for (var i = 0; i < 23; ++i) {
    False.singleStep();
  }
};
