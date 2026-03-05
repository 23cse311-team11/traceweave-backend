/**
 * Executes a Delay node
 * data contains: { delay } in ms
 */
export default async function delayExecutor(node, context) {
  const { data } = node;
  const delayTime = data.delay || 1000;

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, delay: delayTime });
    }, delayTime);
  });
}
