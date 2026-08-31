import { createCheckoutService, type AddressRequestBody } from '@bigcommerce/checkout-sdk';

import type { CustomCheckoutWindow } from './auto-loader';

interface CapturedRequest {
    body?: unknown;
    responseBody?: string;
    responseJson?: unknown;
    status?: number;
    method: string;
    url: string;
}

interface SearchAreaInput {
    latitude: number;
    longitude: number;
    radius: number;
    unit: 'KM' | 'MI';
}

interface PickupOptionState {
    pickupOptions?: Array<{
        pickupMethod?: {
            id: number;
        };
    }>;
}

const LIVE_CONFIRMATION = 'RUN LIVE BOPIS DIAGNOSTIC';

const parseAddress = (value: string): AddressRequestBody => {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Restore address must be a JSON object.');
    }

    return parsed as AddressRequestBody;
};

const parseSearchArea = (latitude: string, longitude: string, radius: string, unit: string): SearchAreaInput => {
    const parsed = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        radius: Number(radius),
        unit,
    };

    if (
        !Number.isFinite(parsed.latitude) ||
        !Number.isFinite(parsed.longitude) ||
        !Number.isFinite(parsed.radius) ||
        parsed.radius <= 0 ||
        (parsed.unit !== 'KM' && parsed.unit !== 'MI')
    ) {
        throw new Error('Enter finite latitude, longitude, a positive radius, and KM or MI.');
    }

    return parsed as SearchAreaInput;
};

const parseRequestBody = (body: unknown): unknown => {
    if (typeof body !== 'string') {
        return body;
    }

    try {
        return JSON.parse(body);
    } catch {
        return body;
    }
};

const getResponseBody = (xhr: XMLHttpRequest): string | undefined => {
    try {
        return xhr.responseText;
    } catch {
        return undefined;
    }
};

const captureFetchRequests = (capturedRequests: CapturedRequest[], pendingResponseCaptures: Promise<void>[]): (() => void) => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

        const isStorefrontRequest = url.includes('/api/storefront/');

        if (isStorefrontRequest) {
            const request = input instanceof Request ? input : undefined;
            const body = init?.body ?? request?.body;

            const capturedRequest: CapturedRequest = {
                body: parseRequestBody(body),
                method: init?.method ?? request?.method ?? 'GET',
                url,
            };

            capturedRequests.push(capturedRequest);

            const response = await originalFetch(input, init);

            const responseCapture = response.clone().text().then(
                (responseBody) => {
                    capturedRequest.responseBody = responseBody;
                    capturedRequest.responseJson = parseRequestBody(responseBody);
                    capturedRequest.status = response.status;
                },
                () => {
                    capturedRequest.status = response.status;
                },
            );
            pendingResponseCaptures.push(responseCapture);

            await responseCapture;

            return response;
        }

        return originalFetch(input, init);
    };

    return () => {
        window.fetch = originalFetch;
    };
};

const captureStorefrontRequests = (capturedRequests: CapturedRequest[], pendingResponseCaptures: Promise<void>[]): (() => void) => {
    const restoreFetch = captureFetchRequests(capturedRequests, pendingResponseCaptures);
    const OriginalXMLHttpRequest = window.XMLHttpRequest;

    class CapturingXMLHttpRequest extends OriginalXMLHttpRequest {
        private requestMethod = '';
        private requestUrl = '';

        open(method: string, url: string | URL): void;
        open(
            method: string,
            url: string | URL,
            async: boolean,
            user?: string | null,
            password?: string | null,
        ): void;
        open(
            method: string,
            url: string | URL,
            async?: boolean,
            user?: string | null,
            password?: string | null,
        ): void {
            this.requestMethod = method;
            this.requestUrl = url.toString();

            if (async === undefined) {
                super.open(method, url);
            } else {
                super.open(method, url, async, user, password);
            }
        }

        send(body?: Document | XMLHttpRequestBodyInit | null): void {
            if (this.requestUrl.includes('/api/storefront/')) {
                const capturedRequest: CapturedRequest = {
                    body: parseRequestBody(body),
                    method: this.requestMethod,
                    url: new URL(this.requestUrl, window.location.href).toString(),
                };

                const responseCapture = new Promise<void>((resolve) => {
                    this.addEventListener('loadend', () => {
                        const responseBody = getResponseBody(this);

                        capturedRequest.responseBody = responseBody;
                        capturedRequest.responseJson = parseRequestBody(responseBody);
                        capturedRequest.status = this.status;
                        resolve();
                    }, { once: true });
                });
                pendingResponseCaptures.push(responseCapture);
                capturedRequests.push(capturedRequest);
            }

            super.send(body);
        }
    }

    window.XMLHttpRequest = CapturingXMLHttpRequest;

    return () => {
        restoreFetch();
        window.XMLHttpRequest = OriginalXMLHttpRequest;
    };
};

const serializeError = (error: unknown): object => {
    if (!(error instanceof Error)) {
        return { error };
    }

    const requestError = error as Error & {
        body?: unknown;
        errors?: unknown;
        status?: number;
        type?: string;
    };

    return {
        body: requestError.body,
        errors: requestError.errors,
        message: requestError.message,
        name: requestError.name,
        status: requestError.status,
        type: requestError.type,
    };
};

const makeInput = (placeholder: string): HTMLInputElement => {
    const input = document.createElement('input');

    input.placeholder = placeholder;

    return input;
};

export const renderBopisDiagnostic = (diagnosticWindow: CustomCheckoutWindow): void => {
    const checkoutId = diagnosticWindow.checkoutConfig.checkoutId;
    const root = document.createElement('main');
    const confirmation = makeInput(`Type ${LIVE_CONFIRMATION} to enable live mutations`);
    const latitude = makeInput('Search latitude');
    const longitude = makeInput('Search longitude');
    const radius = makeInput('Search radius');
    const unit = document.createElement('select');
    const restoreAddress = document.createElement('textarea');
    const runButton = document.createElement('button');
    const output = document.createElement('pre');

    document.body.replaceChildren();
    restoreAddress.placeholder = 'Recipient address JSON used only after pickup is deleted';
    restoreAddress.rows = 10;
    runButton.textContent = 'Run live BOPIS diagnostic';
    runButton.type = 'button';
    output.setAttribute('aria-live', 'polite');

    for (const value of ['KM', 'MI']) {
        const option = document.createElement('option');

        option.value = value;
        option.textContent = value;
        unit.append(option);
    }

    root.append(confirmation, latitude, longitude, radius, unit, restoreAddress, runButton, output);
    document.body.append(root);

    if (!checkoutId) {
        output.textContent = 'Diagnostic unavailable: checkoutConfig.checkoutId is missing.';

        return;
    }

    runButton.addEventListener('click', () => {
        void (async () => {
            const capturedRequests: CapturedRequest[] = [];
            const pendingResponseCaptures: Promise<void>[] = [];
            const transitions: Array<{ name: string; request?: unknown; consignments?: unknown; pickupMethod?: unknown; selectedPickupOption?: unknown }> = [];
            const restoreFetch = captureStorefrontRequests(capturedRequests, pendingResponseCaptures);

            try {
                if (confirmation.value !== LIVE_CONFIRMATION) {
                    throw new Error(`Type "${LIVE_CONFIRMATION}" before running live mutations.`);
                }

                const searchArea = parseSearchArea(latitude.value, longitude.value, radius.value, unit.value);
                const deliveryAddress = parseAddress(restoreAddress.value);
                const checkoutService = createCheckoutService();
                const loaded = await checkoutService.loadCheckout(checkoutId);
                const initialConsignments = loaded.data.getConsignments() ?? [];
                const cart = loaded.data.getCart();

                if (!cart) {
                    throw new Error('The SDK returned no cart after loadCheckout.');
                }

                transitions.push({ name: 'loadCheckout', consignments: initialConsignments });

                if (initialConsignments.length > 0) {
                    throw new Error('Refusing to change this checkout: use a fresh checkout with no consignments.');
                }

                const lineItems = cart.lineItems.physicalItems
                    .filter((item) => item.isShippingRequired)
                    .map(({ id, quantity }) => ({ itemId: id, quantity }));

                if (!lineItems.length) {
                    throw new Error('This checkout has no physical items that require shipping.');
                }

                const createRequest = [{ address: deliveryAddress, lineItems }];
                const created = await checkoutService.createConsignments(createRequest);
                const pickupConsignment = created.data.getConsignments()?.[0];

                transitions.push({
                    name: 'createConsignments_with_address',
                    request: createRequest,
                    consignments: created.data.getConsignments(),
                });

                if (!pickupConsignment) {
                    throw new Error('No consignment was returned after address-backed consignment creation.');
                }

                const pickupQuery = {
                    consignmentId: pickupConsignment.id,
                    searchArea: {
                        coordinates: { latitude: searchArea.latitude, longitude: searchArea.longitude },
                        radius: { unit: searchArea.unit, value: searchArea.radius },
                    },
                };
                const pickupState = await checkoutService.loadPickupOptions(pickupQuery);
                const pickupOptions = pickupState.data.getPickupOptions(
                    pickupQuery.consignmentId,
                    pickupQuery.searchArea,
                );
                const pickupMethod = (pickupOptions as unknown as PickupOptionState[] | undefined)
                    ?.flatMap(({ pickupOptions: options = [] }) => options)[0]
                    ?.pickupMethod;

                transitions.push({
                    name: 'loadPickupOptions',
                    request: pickupQuery,
                    pickupMethod,
                    consignments: pickupState.data.getConsignments(),
                });

                if (!pickupMethod) {
                    throw new Error('BigCommerce returned no native pickup method for this checkout and search area.');
                }

                const pickupSelection = {
                    id: pickupConsignment.id,
                    lineItems,
                    pickupOption: { pickupMethodId: pickupMethod.id },
                };
                const selected = await checkoutService.updateConsignment(pickupSelection);

                const selectedPickupOption = selected.data.getConsignmentById(
                    pickupConsignment.id,
                )?.selectedPickupOption;
                transitions.push({
                    name: 'updateConsignment_pickupOption',
                    request: pickupSelection,
                    consignments: selected.data.getConsignments(),
                    selectedPickupOption,
                });

                const deleted = await checkoutService.deleteConsignment(pickupConsignment.id);

                transitions.push({
                    name: 'deleteConsignment_pickup',
                    request: { id: pickupConsignment.id },
                    consignments: deleted.data.getConsignments(),
                });

                const restored = await checkoutService.updateShippingAddress(deliveryAddress);

                transitions.push({
                    name: 'updateShippingAddress_restore_delivery',
                    request: deliveryAddress,
                    consignments: restored.data.getConsignments(),
                });

                await Promise.all(pendingResponseCaptures);

                output.textContent = JSON.stringify({ capturedRequests, result: 'success', transitions }, null, 2);
            } catch (error) {
                await Promise.all(pendingResponseCaptures);

                output.textContent = JSON.stringify(
                    { capturedRequests, error: serializeError(error), result: 'failed', transitions },
                    null,
                    2,
                );
            } finally {
                restoreFetch();
            }
        })();
    });
};
