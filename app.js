window.addEventListener('WebComponentsReady', function() {
  updateActiveElement(viewContainer.target);

  // Focus an element.
  viewContainer.addEventListener('click', function() {
    updateActiveElement(event.target);
  });

  // New/Delete/Edit an element.
  document.addEventListener('new-element', addNewElement);
  document.addEventListener('delete-element', deleteElement);
  document.addEventListener('element-updated', elementWasUpdated);
  document.addEventListener('fit-element', fitElement);

  document.addEventListener('update-code', function(event) {
    codeView.dump(viewContainer);
  }, true);

  Polymer.Gestures.addListener(viewContainer, 'track', trackElement);

  document.addEventListener('undo', function() {
    actionHistory.undo();
  });
  document.addEventListener('redo', function() {
    actionHistory.redo();
  });
});

function addNewElement(event) {
  var tag = event.detail.type.toLowerCase();
  var el = document.createElement(tag);
  el.style.position = 'absolute';
  el.style.left = el.style.top = '20px';

  // Give it a unique ID.
  var newId = makeUniqueId(el, tag.replace('-', '_'));
  el.id = newId;
  viewContainer.appendChild(el);

  var slots = el.root ? el.root.querySelectorAll('slot') : [];
  // TODO: fix this and make it less this and more something else.
  if (tag === 'div') {
    el.style.height = el.style.width = '200px';
    el.style.backgroundColor = '#CDDC39';
    el.textContent = 'div';
  } else if (tag === 'input') {
    el.placeholder = 'input';
  } else if (tag === 'button' || slots.length != 0) {
    el.textContent = tag;
  }

  // You need the item to render first.
  requestAnimationFrame(function() {
    el.click();
  });
  actionHistory.update('new', el);
}

function deleteElement(event) {
  var el = event.detail.target;

  if (!el) {
    return;
  }

  // Deleting the whole app should remove the children I guess.
  if (el.id === 'viewContainer') {
    actionHistory.update('delete', el, {innerHtml: el.innerHTML});
    el.innerHTML = '';
    updateActiveElement(el);
  } else {
    var parent = el.parentElement
    parent.removeChild(el);
    updateActiveElement(parent);
    actionHistory.update('delete', el, {parent: parent});
  }
}

function fitElement(event) {
  var el = event.detail.target;
  if (!el || el.id === 'viewContainer') {
    return;
  }
  actionHistory.update('fit', shell.activeElement,
    {oldPosition: el.style.position,
    newPosition: 'absolute',
    oldLeft: el.style.left, oldTop: el.style.top,
    newLeft: '0', newTop: '0',
    oldWidth: el.style.width, oldHeight: el.style.height,
    newWidth: '100%', newHeight: '100%'});

  el.style.position = 'absolute';
  el.style.left = el.style.top = '0px';
  el.style.height = el.style.width = '100%';
}

function makeUniqueId(node, id, suffix) {
  var uId = id + (suffix || '');
  return viewContainer.querySelector('#' + uId) ?
    this.makeUniqueId(node, id, suffix ? ++suffix : 1) :
      uId;
}

function elementWasUpdated(event) {
  var detail = event.detail;
  var oldValue = shell.updateActiveElementValues(detail.type, detail.name, detail.value);
  treeView.recomputeTree(viewContainer, shell.activeElement);
  actionHistory.update('update', shell.activeElement,
      {type: detail.type, name: detail.name, newValue: detail.value, oldValue: oldValue});
}

function updateActiveElement(el) {
  if (el !== shell.activeElement) {
    shell.updateActiveElement(el);
  }
  displayElement();
}

function displayElement() {
  var el = shell.activeElement ? shell.activeElement : viewContainer;

  // Display its properties.
  propertiesContainer.display(el);
  stylesContainer.display(window.getComputedStyle(el));
  flexContainer.display(window.getComputedStyle(el));

  // Highlight it in the tree.
  treeView.recomputeTree(viewContainer, shell.activeElement);
}

function trackElement(event) {
  var el = event.target;
  if (el.id === 'viewContainer') {
    return;
  }
  switch(event.detail.state) {
    case 'start':
      el.style.position = 'absolute';
      el.classList.add('dragging');
      el.classList.add('active');
      break;
    case 'track':
      // Grid is 10.
      window._trackx = Math.round(event.detail.dx / 10) * 10;
      window._tracky = Math.round(event.detail.dy / 10) * 10;
      el.style.transform = el.style.webkitTransform =
        'translate(' + _trackx + 'px, ' + _tracky + 'px)';

      // See if it's over anything.
      window._dropTarget = null;
      var targets = viewContainer.children;
      var me = el.getBoundingClientRect();

      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        t.classList.remove('over');

        var slots = t.root ? t.root.querySelectorAll('slot') : [];
        var canDrop = t.tagName === 'DIV' || t.tagName === 'BUTTON' || slots.length !== 0;
        var b = t.getBoundingClientRect();
        if (canDrop &&
            me.left > b.left && me.left < b.left + b.width &&
            me.top > b.top && me.top < b.top + b.height) {
          t.classList.add('over');
          window._dropTarget = t;
        }
      }
      break;
    case 'end':
      // Save the position before we might reparent the item.
      var local = el.getBoundingClientRect();

      // Does this need to be added to a new parent?
      if (window._dropTarget) {
        var oldParent = el.parentElement;
        el.parentElement.removeChild(el);
        window._dropTarget.appendChild(el);
        window._dropTarget.classList.remove('over');
        actionHistory.update('reparent', el, {newParent: window._dropTarget, oldParent: oldParent});
        window._dropTarget = null;
      } else if (el.parentElement && (el.parentElement !== viewContainer)) {
        // If there's no drop target and the el used to be in a different
        // parent, move it to the main view.
        actionHistory.update('reparent', el, {newParent: viewContainer, oldParent: el.parentElement});
        el.parentElement.removeChild(el);
        viewContainer.appendChild(el);
      }
      var parent = el.parentElement.getBoundingClientRect();

      var oldLeft = el.style.left;
      var oldTop = el.style.top;
      el.style.left = local.left - parent.left + 'px';
      el.style.top = local.top - parent.top + 'px';
      actionHistory.update('move', el,
          {newLeft: el.style.left, newTop: el.style.top, oldLeft: oldLeft, oldTop: oldTop});

      el.classList.remove('dragging');
      el.style.transform = el.style.webkitTransform = 'none';
      break;
  }
  updateActiveElement(el);
  var size = el.getBoundingClientRect();
  stylesContainer.display({top: size.top + 'px', left: size.left + 'px'});
}
