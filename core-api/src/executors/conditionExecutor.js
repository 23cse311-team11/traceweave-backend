import jexl from 'jexl';

/**
 * Executes a Condition node
 * data contains: { expression }
 */
export default async function conditionExecutor(node, context) {
  const { data } = node;
  const { expression } = data;

  if (!expression) {
    throw new Error('Expression is required for ConditionNode');
  }

  try {
    const isTrue = await jexl.eval(expression, context);
    
    return { 
      success: true, 
      result: isTrue, 
      branch: isTrue ? 'true' : 'false' // Used to decide which edge to follow
    };
  } catch (error) {
    throw new Error(`Condition execution failed: ${error.message}`);
  }
}
