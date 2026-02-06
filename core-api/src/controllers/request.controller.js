import httpStatus from 'http-status';
import { requestDefinitionService } from '../services/requestDefinition.service.js';
import { sendRequestService } from '../services/sendRequest.service.js';
import catchAsync from '../utils/catchAsync.js';

export const requestController = {
    createRequest: catchAsync(async (req, res) => {
        const request = await requestDefinitionService.createRequest(req.body);
        res.status(httpStatus.CREATED).send(request);
    }),

    getRequestsByCollection: catchAsync(async (req, res) => {
        const requests = await requestDefinitionService.getRequestsByCollection(
            req.params.collectionId
        );
        res.send(requests);
    }),

    updateRequest: catchAsync(async (req, res) => {
        const request = await requestDefinitionService.updateRequest(
            req.params.requestId,
            req.body
        );
        res.send(request);
    }),

    deleteRequest: catchAsync(async (req, res) => {
        await requestDefinitionService.softDeleteRequest(req.params.requestId);
        res.status(httpStatus.NO_CONTENT).send();
    }),

    sendRequest: catchAsync(async (req, res) => {
        const { requestId } = req.params;
        const response = await sendRequestService.sendRequest(requestId);
        res.send(response);
    }),
};
