import { assertFixtures } from "../parser/fixtures.js";

const result = assertFixtures();

if (result.failed.length > 0) {
  console.error("Parser fixture failures:");
  for (const failure of result.failed) {
    console.error(` - ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.info(`Parser fixtures passed (${result.passed})`);
}
