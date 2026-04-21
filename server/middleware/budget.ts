import type { Request, Response, NextFunction } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { checkBudgetBeforeApiCall } from '../services/budget-manager.js';

export function createBudgetMiddleware(db: DatabaseAdapter) {
  return function checkBudget(req: Request, res: Response, next: NextFunction): void {
    const userId = req.user?.id;

    // Skip budget check if no user (shouldn't happen with auth middleware)
    if (!userId || userId === 'solo') {
      next();
      return;
    }

    // Estimate tokens from request (rough heuristic: ~3 chars per token)
    const messageLength = JSON.stringify(req.body).length;
    const estimatedTokens = Math.ceil(messageLength / 3);

    const budgetCheck = checkBudgetBeforeApiCall(db, userId, estimatedTokens);

    if (!budgetCheck.allowed) {
      res.status(429).json({
        error: 'Budget limit exceeded',
        reason: budgetCheck.reason,
      });
      return;
    }

    next();
  };
}
