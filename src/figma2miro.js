/* eslint-disable no-unused-vars */
miro.onReady(() => {
  miro.initialize({
    extensionPoints: {
      bottomBar: {
        title: 'Figma2Miro',
        svgIcon: '<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" width="20" height="24"><style>.st0{fill:#0acf83}.st1{fill:#a259ff}.st2{fill:#f24e1e}.st3{fill:#ff7262}.st4{fill:#1abcfe}</style><title>Figma.logo</title><desc>Created using Figma</desc><path id="path0_fill" class="st0" d="M50 300c27.6 0 50-22.4 50-50v-50H50c-27.6 0-50 22.4-50 50s22.4 50 50 50z"/><path id="path1_fill" class="st1" d="M0 150c0-27.6 22.4-50 50-50h50v100H50c-27.6 0-50-22.4-50-50z"/><path id="path1_fill_1_" class="st2" d="M0 50C0 22.4 22.4 0 50 0h50v100H50C22.4 100 0 77.6 0 50z"/><path id="path2_fill" class="st3" d="M100 0h50c27.6 0 50 22.4 50 50s-22.4 50-50 50h-50V0z"/><path id="path3_fill" class="st4" d="M200 150c0 27.6-22.4 50-50 50s-50-22.4-50-50 22.4-50 50-50 50 22.4 50 50z"/></svg>',
        onClick: () => {
          miro.board.ui.openModal('figmaModal.html',
            {
              width: 600,
              height: 400,
            });
        },
      },
    },
  });
});

function togglePageCb(e) {
  e.preventDefault();
  const tb = document.querySelector('.f2m-tb-pages');
  const toggler = document.querySelector('.f2m-cb-allPages input');
  tb.disabled = !tb.disabled;
  toggler.checked = !toggler.checked;
}

function validateFigmaFileUrl(url) {
  if (!url) return false;
  const regexp = new RegExp('^(?:https:\\/\\/)?(?:www\\.)?figma\\.com\\/(file|proto)\\/([0-9a-zA-Z]{22,128})(?:\\/([^\\?\\n\\r\\/]+)?((?:\\?[^\\/]*?node-id=([^&\\n\\r\\/]+))?[^\\/]*?)(\\/duplicate)?)?$');
  return !!regexp.test(url);
}

function onInputChangeHandler(elem) {
  console.log(elem);
  const errorBox = document.querySelector('.auth-error');
  const actionBtn = document.querySelector('.sendToMiro');
  if (!validateFigmaFileUrl(elem.value)) {
    errorBox.innerHTML = 'Please enter valid Figma URL.';
    actionBtn.disabled = true;
    return;
  }
  errorBox.innerHTML = '';
  actionBtn.disabled = false;
}

function onLoadHandler() {
  if (localStorage.getItem('f2m-at')) {
    const f2mModal = document.querySelector('.f2m-body');
    f2mModal.setAttribute('data-authStage', 'completed');
  }
}

function badTokenHandler(err) {
  if (err) console.error(err);
  const f2mModal = document.querySelector('.f2m-body');
  f2mModal.removeAttribute('data-authStage');
}

async function doFigmaAuth() {
  const f2mModal = document.querySelector('.f2m-body');
  const authStage = f2mModal.getAttribute('data-authStage');
  const errorBox = document.querySelector('.auth-error');
  errorBox.innerHTML = '';
  // eslint-disable-next-line no-undef
  const state = await miro.currentUser.getId();
  if (authStage && authStage === 'getToken') {
    fetch(`https://miro-auth-stage.herokuapp.com/postauth?state=${state}`)
      .then((response) => response.json())
      .then((data) => {
        localStorage.setItem('f2m-at', data.access_token);
        f2mModal.setAttribute('data-authStage', 'completed');
      })
      .catch((err) => {
        errorBox.innerHTML = 'Unexpected error while authorizing. Please try again later.';
        f2mModal.removeAttribute('data-authStage');
      });
  } else {
    const figmaAuthURL = `https://www.figma.com/oauth?client_id=OCNljv8VVPqctvRMUglYVu&redirect_uri=https://miro-auth-stage.herokuapp.com/oauth&scope=file_read&state=${state}&response_type=code`;
    window.open(figmaAuthURL);
    f2mModal.setAttribute('data-authStage', 'getToken');
  }
}

function getFigmaDocument(accessToken, fileKey) {
  return fetch(`https://api.figma.com/v1/files/${fileKey}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
    .then((response) => {
      if (response.status === 403) throw new Error('Bad token!');
      return response.json();
    })
    .catch((err) => {
      if (err.message === 'Bad token!') {
        badTokenHandler(err);
      } else {
        console.error(err);
      }
    });
}

function getFigmaNodeImages(accessToken, fileKey, ids) {
  return fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${ids}&format=svg`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
    .then((response) => {
      if (response.status === 403) throw new Error('Bad token!');
      return response.json();
    })
    .then((data) => data.images)
    .catch((err) => {
      if (err.message === 'Bad token!') {
        badTokenHandler(err);
      }
    });
}

function iterateOverNodeChildren(nodeTreeObject, operation) {
  if (nodeTreeObject.children) {
    nodeTreeObject.children.forEach((child) => iterateOverNodeChildren(child, operation));
  } else {
    operation(nodeTreeObject);
  }
}

async function doMagic(btn) {
  const accessToken = localStorage.getItem('f2m-at');
  const figmaFileParams = btn.parentNode.querySelector('input').value
    .replace(/^(.*?)file\//gs, '').split('/');
  const fileKey = figmaFileParams[0];
  const pageNodeId = figmaFileParams[1]
    .replace(/^(.*?)node-id=/gs, '')
    .replace('%3A', ':');
  const pagesCheckbox = document.querySelector('.f2m-cb-allPages input');
  const pagesTextbox = document.querySelector('.f2m-tb-pages');

  if (accessToken) {
    const figmaDocument = await getFigmaDocument(accessToken, fileKey);
    let documentPages = figmaDocument.document.children;

    if (!pagesCheckbox.checked) {
      const pageNumbers = pagesTextbox.value
        .split(',')
        .filter((n) => parseInt(n, 10))
        .map((n) => parseInt(n, 10) - 1);
      documentPages = documentPages.filter((page, num) => pageNumbers.indexOf(num) !== -1);
    }

    let topNodes = documentPages.map((page) => page.children).flat();
    const topNodesImages = await getFigmaNodeImages(
      accessToken,
      fileKey,
      topNodes.map((node) => node.id).join(),
    );

    topNodes = topNodes.map((node) => ({
      type: 'image',
      url: topNodesImages[node.id],
      title: node.name,
      x: node.absoluteBoundingBox.x,
      y: node.absoluteBoundingBox.y,
    }));
    topNodes = await miro.board.widgets.create(topNodes);
    const ids = topNodes.map((node) => node.id);
    await miro.board.selection.selectWidgets(ids);
    await miro.board.ui.closeModal('figmaModal.html');
  }
}
