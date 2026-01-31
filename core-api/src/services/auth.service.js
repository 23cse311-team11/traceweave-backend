import httpStatus from 'http-status';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import ApiError from '../utils/ApiError.js';

const createUser = async (userBody) => {
  if (await prisma.user.findUnique({ where: { email: userBody.email } })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(userBody.password, salt);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: userBody.email,
        fullName: userBody.name,
      },
    });

    await tx.identity.create({
      data: {
        userId: newUser.id,
        provider: 'email',
        passwordHash: passwordHash,
      },
    });

    return newUser;
  });
  
  return user;
};

const loginUserWithEmailAndPassword = async (email, password) => {
  const user = await prisma.user.findUnique({ 
    where: { email },
    include: { identities: true }
  });

  if (!user) {
     throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }

  const emailIdentity = user.identities.find(id => id.provider === 'email');
  if (!emailIdentity || !emailIdentity.passwordHash || !(await bcrypt.compare(password, emailIdentity.passwordHash))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }

  return user;
};

export default {
  createUser,
  loginUserWithEmailAndPassword,
};

/**
 * Handles the logic of finding a user, creating one, or linking a new provider.
 * @param {string} email - User's email from provider
 * @param {string} provider - 'google' or 'github'
 * @param {string} providerId - Unique ID from provider (e.g. sub)
 * @param {object} profileData - { fullName, avatarUrl }
 */
export const findOrCreateUser = async (email, provider, providerId, profileData) => {
  // 1. Try to find an existing IDENTITY
  const existingIdentity = await prisma.identity.findUnique({
    where: {
      provider_providerId: {
        provider,
        providerId,
      },
    },
    include: { user: true },
  });

  if (existingIdentity) {
    return existingIdentity.user;
  }

  // 2. If no identity, check if USER exists by email
  let user = await prisma.user.findUnique({
    where: { email },
  });

  // 3. If User doesn't exist, Create User
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        fullName: profileData.fullName,
        avatarUrl: profileData.avatarUrl,
      },
    });
  }

  // 4. Create the Identity Link (Link Provider -> User)
  await prisma.identity.create({
    data: {
      userId: user.id,
      provider,
      providerId,
    },
  });

  return user;
};