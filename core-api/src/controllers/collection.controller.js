import httpStatus from 'http-status';
import { CollectionService } from '../services/collection.service.js';
import { workspaceService } from '../services/workspace.service.js';


const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const createCollection = catchAsync(async (req, res) => {
  const { name, parentId } = req.body;
  console.log(req.body)
  const { workspaceId } = req.params;
  const userId = req.user.id;

  const collection = await CollectionService.createCollection({
    workspaceId,
    name,
    parentId,
    userId,
  });

  res.status(httpStatus.CREATED).send(collection);
});

export const getCollectionsByWorkspace = catchAsync(async (req, res) => {
  try {
    console.log('Getting collections for workspace:', req.params.workspaceId);
    const { workspaceId } = req.params;
    const userId = req.user.id;
  
    console.log('User ID:', userId);
    const collections =
      await CollectionService.getCollectionsByWorkspace(workspaceId, userId);
    console.log('Collections retrieved:', collections.length);
    res.status(httpStatus.OK).send(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
  }
});

export const deleteCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  const userId = req.user.id;

  const result =
    await CollectionService.softDeleteCollection(collectionId, userId);

  res.status(httpStatus.OK).send(result);
});

export const updateCollection = catchAsync(async (req, res) => {
  const { collectionId } = req.params;
  const { name } = req.body;
  const userId = req.user.id;

  const collection = await CollectionService.updateCollection(
    collectionId,
    { name },
    userId
  );

  res.status(httpStatus.OK).send(collection);
});

