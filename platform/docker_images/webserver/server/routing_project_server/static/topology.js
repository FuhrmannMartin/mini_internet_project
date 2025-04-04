async function loadTopology() {
  let data;
  try {
    const response = await fetch('/static/topology.json');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    data = await response.json();
  } catch (err) {
    console.error("Failed to load topology:", err);
    return;
  }

  const nodeColors = {
    tier1: "#e74c3c",
    ixp: "#f39c12",
    student: "#3498db",
    stub: "#7f8c8d"
  };

  const nodes = new vis.DataSet(
    data.nodes.map(n => {
      const node = {
        id: n.id,
        label: n.label,
        color: nodeColors[n.type] || "#cccccc",
        x: n.x,
        y: n.y,
        fixed: { x: true, y: true },
        shape: 'circle'
      };

      if (n.type === 'ixp') {
        node.shape = 'box';
        node.width = 60;
        node.height = 20;
        node.label = `IXP ${n.id}`;
      }

      return node;
    })
  );

  const edges = new vis.DataSet(
    data.edges.map(e => ({
      from: e.from,
      to: e.to,
      color: e.type === "prov"
        ? "red"
        : "green",
      dashes: e.type !== "prov", // ✅ now works!
      arrows: ""
    }))
  );

  const container = document.getElementById("network");
  const network = new vis.Network(container, { nodes, edges }, {
    physics: false,
    layout: { improvedLayout: false },
    interaction: { dragNodes: false }
  });

  drawTraceroutePath(network, nodes);
}

async function drawTraceroutePath(network, allNodes) {
  let data;
  try {
    const response = await fetch('/api/traceroute');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    data = await response.json();
  } catch (err) {
    console.error("Failed to load traceroutes:", err);
    return;
  }

  const asPath = data.as_path;  // Example: [3, 4, 5, 6, 7, 8]
  const color_highlight = '#8e44ad'

  const tracerouteEdges = [];
  for (let i = 0; i < asPath.length - 1; i++) {
    tracerouteEdges.push({
      from: asPath[i],
      to: asPath[i + 1],
      color: { color: color_highlight },  // purple path
      width: 3,
      dashes: false,
      arrows: 'to'
    });
  }

  // Add traceroute path on top of existing edges
  network.body.data.edges.add(tracerouteEdges);

  // Optionally highlight the nodes too
  for (const asn of asPath) {
    const node = allNodes.get(asn);
    if (node) {
      allNodes.update({ id: asn, color: { border: color_highlight } });
    }
  }
}

loadTopology();
