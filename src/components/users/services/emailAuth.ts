import bcrypt from 'bcrypt';
import { Response } from 'express';
import { AnyObject, Types } from 'mongoose';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import {
    AppError,
    errorHandler,
    HttpCode
} from '../../../library/errorHandler';
import logger from '../../../library/logger';
import User from '../model';
import { generateToken } from './jwt';

interface IUser {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    password?: string;
    phoneNumber?: string;
    profilePicture?: string;
    token?: string;
}

interface IUserRegister {
    firstName: string;
    lastName: string;
    password: string;
    confirmPassword?: string;
}

export const emailRegister = async (userData: IUserRegister, res: Response) => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);
    userData.password = hashedPassword;
    delete userData.confirmPassword;

    //add user to db
    const createdUser: AnyObject = await User.create(userData);
    if (createdUser) {
        const createdUserData: IUser = { ...createdUser._doc };
        createdUserData['token'] = generateToken(createdUserData._id);
        delete createdUserData.password;
        res.status(201).json(createdUserData);
    } else {
        const error = new Error('Unable to save new user instance');
        errorHandler.handleError(error, res);
    }
};

export const emailLogin = async (
    basicUserDoc: IUser,
    res: Response,
    password: string,
    limiterConsecutiveFailsByEmailAndIP: RateLimiterRedis,
    limiterSlowBruteByIP: RateLimiterRedis,
    resEmailAndIP: RateLimiterRes | null,
    ipAddr: string,
    emailIPkey: string
) => {
    const passwordValidation = await bcrypt.compare(
        password,
        basicUserDoc.password as string
    );
    if (!passwordValidation) {
        // Consume 1 point from limiters on wrong attempt and block if limits reached
        try {
            const promises = [limiterSlowBruteByIP.consume(ipAddr)];
            promises.push(
                limiterConsecutiveFailsByEmailAndIP.consume(emailIPkey)
            );
            await Promise.all(promises);
            const error = new AppError({
                httpCode: HttpCode.BAD_REQUEST,
                description: 'Invalid Credentials'
            });
            logger.error(error);
            errorHandler.handleError(error, res);
            return;
        } catch (error: any) {
            if (error instanceof Error) {
                errorHandler.handleError(error, res);
                return;
            } else {
                res.set(
                    'Retry-After',
                    String(Math.round(error.msBeforeNext / 1000) || 1)
                );
                res.status(429).send('Too Many Requests');
                return;
            }
        }
    }
    if (resEmailAndIP !== null && resEmailAndIP.consumedPoints > 0) {
        // Reset on successful authorisation
        await limiterConsecutiveFailsByEmailAndIP.delete(emailIPkey);
    }
    const user: IUser = basicUserDoc;
    user['token'] = generateToken(basicUserDoc._id);
    delete user.password;
    res.status(200).json(user);
};
