import assert from 'node:assert/strict';
import test from 'node:test';
import { Application, ApplicationEvaluatorAssignment } from '../src/types';
import {
  getAssignedEvaluatorIds,
  getEvaluatorAssignmentStatus,
  getEvaluatorProgress,
  isAssignedEvaluator,
} from '../src/lib/evaluatorAssignments';

function assignment(evaluatorId: string, status: ApplicationEvaluatorAssignment['status']): ApplicationEvaluatorAssignment {
  return {
    id: `assignment-${evaluatorId}`,
    application_id: 'nomination-1',
    evaluator_id: evaluatorId,
    route_id: 'original-route',
    sequence_no: 1,
    status,
    assigned_at: '2026-09-01',
    completed_at: status === 'Completed' ? '2026-09-02' : null,
  };
}

function nomination(
  assignments: ApplicationEvaluatorAssignment[] | undefined,
): Application {
  return { evaluator_assignments: assignments } as Application;
}

test('a single pending evaluator is assigned and others are not', () => {
  const app = nomination([assignment('A', 'Pending')]);
  assert.equal(isAssignedEvaluator(app, 'A'), true);
  assert.equal(isAssignedEvaluator(app, 'B'), false);
  assert.deepEqual(getEvaluatorProgress(app), { assignedCount: 1, completedCount: 0 });
});

test('multiple statuses count three active assignments and one completion', () => {
  const app = nomination([
    assignment('A', 'Completed'),
    assignment('B', 'In Progress'),
    assignment('C', 'Pending'),
  ]);
  assert.deepEqual(getAssignedEvaluatorIds(app), ['A', 'B', 'C']);
  assert.deepEqual(getEvaluatorProgress(app), { assignedCount: 3, completedCount: 1 });
  assert.equal(getEvaluatorAssignmentStatus(app, 'B'), 'In Progress');
});

test('reassigned evaluators are excluded from active access and progress', () => {
  const app = nomination([assignment('A', 'Reassigned'), assignment('B', 'Pending')]);
  assert.equal(isAssignedEvaluator(app, 'A'), false);
  assert.equal(isAssignedEvaluator(app, 'B'), true);
  assert.deepEqual(getEvaluatorProgress(app), { assignedCount: 1, completedCount: 0 });
});

test('existing nomination assignments remain the snapshot after the award route changes', () => {
  const app = nomination([assignment('A', 'Pending'), assignment('B', 'Pending')]);
  const currentAwardRoute = ['C', 'D'];
  assert.deepEqual(getAssignedEvaluatorIds(app), ['A', 'B']);
  assert.equal(currentAwardRoute.some(id => isAssignedEvaluator(app, id)), false);
});

test('missing relational assignments do not grant evaluator access', () => {
  const app = nomination(undefined);
  assert.equal(isAssignedEvaluator(app, 'A'), false);
  assert.deepEqual(getEvaluatorProgress(app), { assignedCount: 0, completedCount: 0 });
});

test('progress counts only active relational assignments', () => {
  const app = nomination([
    assignment('A', 'Completed'), assignment('B', 'Completed'),
    assignment('C', 'Reassigned'), assignment('D', 'Pending'),
  ]);
  assert.deepEqual(getEvaluatorProgress(app), { assignedCount: 3, completedCount: 2 });
  app.evaluator_assignments![3].status = 'Completed';
  assert.deepEqual(getEvaluatorProgress(app), { assignedCount: 3, completedCount: 3 });
});
