import jexl from 'jexl';

/**
 * Executes a Test node
 * data contains: { assertion }
 */
export default async function testExecutor(node, context) {
  const { data } = node;
  const { assertion } = data;

  if (!assertion) {
    throw new Error('Assertion expression is required for TestNode');
  }

  try {
    const isPassing = await jexl.eval(assertion, context);
    
    return { 
      success: true, 
      pass: !!isPassing,
      branch: isPassing ? 'pass' : 'fail' // Edge matching
    };
  } catch (error) {
    throw new Error(`Test assertion failed: ${error.message}`);
  }
}
