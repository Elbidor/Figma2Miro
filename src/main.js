/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
miro.onReady(() => {
  miro.initialize({
    extensionPoints: {
      bottomBar: {
        title: 'Figma2Miro',
        svgIcon: '<circle cx="12" cy="12" r="9" fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="2"/>',
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

function togglePageCb() {
  document.querySelector('.f2m-tb-pages').toggleAttribute('disabled');
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
  // eslint-disable-next-line no-undef
  const state = await miro.currentUser.getId();
  if (authStage && authStage === 'getToken') {
    fetch(`https://miro-auth-stage.herokuapp.com/postauth?state=${state}`)
      .then((response) => response.json())
      .then((data) => localStorage.setItem('f2m-at', data.access_token));
    f2mModal.setAttribute('data-authStage', 'completed');
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
