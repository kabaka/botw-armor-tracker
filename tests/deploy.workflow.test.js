import { readFileSync } from 'fs';
import { expect, test } from 'vitest';

const WORKFLOW_PATH = '.github/workflows/deploy.yml';

function getWorkflow(){
  return readFileSync(WORKFLOW_PATH, 'utf8');
}

test('deploy workflow packages src files for GitHub Pages', () => {
  const workflow = getWorkflow();
  expect(workflow).toMatch(/cp -r\s+icons\s+data\s+src\s+dist\//);
});
