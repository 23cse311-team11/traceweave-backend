import vm from 'vm';

/**
 * Executes a Script node
 * data contains: { script }
 */
export default async function scriptExecutor(node, context) {
  const { data } = node;
  const { script } = data;

  if (!script) {
    return { success: true, message: 'No script provided' };
  }

  try {
    // Create a sandbox with a reference to the context
    // We stringify and parse to avoid mutating the original sandbox context dangerously,
    // though the script CAN mutate context properties explicitly passed in.
    const sandbox = {
      responses: context.responses,
      variables: context.variables,
      logs: [],
      console: {
        log: (...args) => sandbox.logs.push(args.join(' ')),
      }
    };

    vm.createContext(sandbox);

    // Run the script. The script can mutate sandbox.responses, sandbox.variables
    const code = `
      try {
        ${script}
      } catch (e) {
        throw e;
      }
    `;

    vm.runInContext(code, sandbox, { timeout: 1000 });

    return { 
      success: true, 
      logs: sandbox.logs
    };
  } catch (error) {
    throw new Error(`Script execution failed: ${error.message}`);
  }
}
