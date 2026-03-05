import jexl from 'jexl';

/**
 * Executes a Transform node
 * data contains: { variable, expression }
 * variable is like "variables.token"
 * expression is like "responses.node_1.body.token"
 */
export default async function transformExecutor(node, context) {
  const { data } = node;
  const { variable, expression } = data;

  if (!variable || !expression) {
    throw new Error('Variable name and expression are required for TransformNode');
  }

  try {
    const value = await jexl.eval(expression, context);
    
    // Support simple property assignment like 'variables.token' -> context.variables.token = value
    // Assuming variable always starts with 'variables.'
    const varName = variable.replace(/^variables\./, '');
    if (!context.variables) context.variables = {};
    context.variables[varName] = value;

    return { success: true, value };
  } catch (error) {
    throw new Error(`Transform execution failed: ${error.message}`);
  }
}
