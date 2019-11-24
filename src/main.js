miro.onReady(() => {
  miro.initialize({
    extensionPoints: {
      bottomBar: {
        title: 'Figma2Miro',
        svgIcon: '<circle cx="12" cy="12" r="9" fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="2"/>',
        onClick: () => {
          miro.board.ui.openModal('figmaModal.html');
        }
      }
    }
  })
})

async function doFigmaAuth() {
  const f2mModal = document.querySelector('.f2m-body');
  const authStage = f2mModal.getAttribute('data-authStage');
  const state = await miro.currentUser.getId();
  if (authStage && authStage === 'getToken') {
    fetch(`https://miro-auth-stage.herokuapp.com/postauth?state=${state}`)
      .then(response => response.json())
      .then(data => localStorage.setItem('f2m-at', data.access_token));
    f2mModal.setAttribute('data-authStage', 'completed');
  } else {
    const figmaAuthURL = `https://www.figma.com/oauth?client_id=OCNljv8VVPqctvRMUglYVu&redirect_uri=https://miro-auth-stage.herokuapp.com/oauth&scope=file_read&state=${state}&response_type=code`;
    window.open(figmaAuthURL);
    f2mModal.setAttribute('data-authStage', 'getToken');
  }
}

function getFigmaPageNode(accessToken, fileKey, pageNodeId) {
  return fetch(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${pageNodeId}`, {
    method: 'GET',
    headers: {
      "X-FIGMA-TOKEN": accessToken
    }
  })
    .then(response => response.json());
}

function getFigmaNodeImages(accessToken, fileKey, ids) {
  return fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${ids}&format=svg`, {
    method: 'GET',
    headers: {
      "X-FIGMA-TOKEN": accessToken
    }
  })
    .then(response => response.json())
    .then(data => data.images);
}

function iterateOverNodeChildren(nodeTreeObject, operation) {
  if (nodeTreeObject.children) {
    nodeTreeObject.children.forEach(child => iterateOverNodeChildren(child, operation));
  } else {
    operation(nodeTreeObject);
  }
}

async function doMagic(btn) {
  const accessToken = localStorage.getItem('f2m-at');
  let figmaFileParams = btn.parentNode.querySelector("input").value
    .replace(/^(.*?)file\//gs, "").split("/");
  const fileKey = figmaFileParams[0];
  const pageNodeId = figmaFileParams[1]
    .replace(/^(.*?)node-id=/gs, "")
    .replace("%3A", ":");
  let nodeChildrenIds = [];

  if (accessToken) {
    console.log(accessToken);
    let figmaPageNode = await getFigmaPageNode(accessToken, fileKey, pageNodeId);
    iterateOverNodeChildren(figmaPageNode.nodes[pageNodeId].document, (node) => {
      nodeChildrenIds.push(node.id);
    });
    let images = await getFigmaNodeImages(accessToken, fileKey, nodeChildrenIds.join());

    iterateOverNodeChildren(figmaPageNode.nodes[pageNodeId].document, (node) => {
      miro.board.widgets.create({
        x: node.absoluteBoundingBox.x,
        y: node.absoluteBoundingBox.y,
        type: 'image',
        url: images[node.id],
        title: `Test name: ${node.id}`
      })
    })
  }
}