import { NextFunction, Request, Response } from 'express';
import { ObjectSchema, ValidationError } from 'joi';
import { AppError, errorHandler, HttpCode } from '../library/errorHandler';

import logger from '../library/logger';

export const reqValidation = (schema: ObjectSchema) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            await schema.validateAsync(req.body);
            next();
        } catch (error: ValidationError | unknown) {
            if (error instanceof ValidationError) {
                errorHandler.handleError(
                    new AppError({
                        name: 'JOI validation Error',
                        httpCode: HttpCode.BAD_REQUEST,
                        description: error.annotate()
                    }),
                    res
                );
            } else {
                if (typeof error === 'string') {
                    errorHandler.handleError(new Error(error), res);
                } else if (error instanceof Error) {
                    errorHandler.handleError(error, res);
                } else {
                    logger.error('Unable to display reason for error');
                }
            }
        }
    };
};
