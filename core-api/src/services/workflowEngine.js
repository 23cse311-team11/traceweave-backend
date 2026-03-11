import requestExecutor from '../executors/requestExecutor.js';
import conditionExecutor from '../executors/conditionExecutor.js';
import transformExecutor from '../executors/transformExecutor.js';
import delayExecutor from '../executors/delayExecutor.js';
import testExecutor from '../executors/testExecutor.js';
import scriptExecutor from '../executors/scriptExecutor.js';

const executors = {
  requestNode: requestExecutor,
  conditionNode: conditionExecutor,
  transformNode: transformExecutor,
  delayNode: delayExecutor,
  testNode: testExecutor,
  scriptNode: scriptExecutor,
};

export class WorkflowEngine {
  constructor(workflow, initialContext, emitEvent) {
    this.nodes = workflow.nodes || [];
    this.edges = workflow.edges || [];
    this.context = { variables: {}, responses: {}, logs: [], ...initialContext };
    this.emitEvent = emitEvent || (() => {});
    
    this.nodeMap = new Map();
    this.nodes.forEach(node => this.nodeMap.set(node.id, node));
    this.visited = new Set();
  }

  findStartNode() {
    return this.nodes.find(n => n.type === 'startNode');
  }

  getNextNodes(currentNodeId, resultBranch) {
    const outgoingEdges = this.edges.filter(e => e.source === currentNodeId);
    
    if (resultBranch) {
      // Find edge with specific sourceHandle matching the branch
      const specificEdge = outgoingEdges.find(e => e.sourceHandle === resultBranch);
      if (specificEdge) {
        return [this.nodeMap.get(specificEdge.target)].filter(Boolean);
      }
    }

    // Default: return all targets if no specific branch was found
    // If a node emitted a branch but no matching edge was found, it stops down this path.
    if (resultBranch) return [];

    return outgoingEdges.map(e => this.nodeMap.get(e.target)).filter(Boolean);
  }

  async runNode(node) {
    if (!node || this.visited.has(node.id)) return; // Prevent infinite loops
    
    if (node.type === 'endNode') {
      this.emitEvent({ type: 'node-complete', nodeId: node.id, status: 'success' });
      return;
    }

    this.visited.add(node.id);
    this.emitEvent({ type: 'node-start', nodeId: node.id });
    this.context.currentNode = node.id;

    let branch = null;
    let error = null;

    try {
      const executor = executors[node.type];
      
      if (executor) {
        const result = await executor(node, this.context);
        if (result && result.branch) {
          branch = result.branch;
        }
      }

      this.emitEvent({ type: 'node-complete', nodeId: node.id, status: 'success' });
    } catch (e) {
      error = e;
      this.context.logs.push(`Error in node ${node.id}: ${e.message}`);
      this.emitEvent({ type: 'node-error', nodeId: node.id, status: 'failed', error: e.message });
      // Stop execution down this branch if error
      return;
    }

    // Proceed to next node(s)
    const nextNodes = this.getNextNodes(node.id, branch);
    
    // We execute them sequentially to maintain context updates predictability in a simple engine.
    // For advanced engines, parallel execution could be used.
    for (const nextNode of nextNodes) {
      await this.runNode(nextNode);
    }
  }

  async run() {
    const startNode = this.findStartNode();
    
    if (!startNode) {
      throw new Error("No start node found in workflow");
    }

    this.emitEvent({ type: 'workflow-start' });
    await this.runNode(startNode);
    this.emitEvent({ type: 'workflow-complete', context: this.context });

    return this.context;
  }
}
