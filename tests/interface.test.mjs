import test from 'node:test';
import assert from 'node:assert/strict';
import {runInterfaceSmoke} from '../scripts/interface-smoke.mjs';
test('all application views and interaction pathways render and execute',async()=>{
 const report=await runInterfaceSmoke();assert.ok(report.passed>=12);assert.equal(report.checks.length,report.passed);
});
