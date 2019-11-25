/* eslint-disable no-unused-vars */
miro.onReady(() => {
  miro.initialize({
    extensionPoints: {
      bottomBar: {
        title: 'Figma2Miro',
        svgIcon: '<circle cx="12" cy="12" r="9" fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="2"/>',
        onClick: () => {
          miro.board.ui.openModal('figmaModal.html');
        },
      },
    },
  });
});

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

function getFigmaPageNode(accessToken, fileKey, pageNodeId) {
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
    .catch((err) => badTokenHandler(err));
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
      const data = response.json();
      return data.images;
    })
    .catch((err) => badTokenHandler(err));
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

  if (accessToken) {
    // TO DO:
    // 1) choose pages or multiple pages
    // 2) image location (grid)
    const figmaPageNode = await getFigmaPageNode(accessToken, fileKey, pageNodeId);
    const pageTopNodes = figmaPageNode.document.children[0].children;
    const images = await getFigmaNodeImages(accessToken, fileKey, pageTopNodes.map((node) => node.id).join());

    figmaPageNode.document.children[0].children.forEach((node) => {
      miro.board.widgets.create({
        type: 'image',
        url: images[node.id],
        title: node.name,
      });
    });
  }
}
