import { type Address, type AddressRequestBody } from '@bigcommerce/checkout-sdk';
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { flowerDenPickupConfig } from './flowerDenPickupConfig';
import { useShipping } from './hooks/useShipping';

type FulfillmentMethod = 'delivery' | 'pickup';

interface PickupMethod {
    collectionInstructions: string;
    collectionTimeDescription: string;
    displayName: string;
    id: number;
}

interface PickupOptionState {
    pickupOptions?: Array<{
        pickupMethod?: PickupMethod;
    }>;
}

export interface PickupFulfillmentProps {
    children: ReactNode;
    onPickupContinue(): void;
    onUnhandledError(error: Error): void;
}

const getPickupMethod = (pickupOptions: unknown): PickupMethod | undefined =>
    (pickupOptions as PickupOptionState[] | undefined)
        ?.flatMap(({ pickupOptions: options = [] }) => options)[0]
        ?.pickupMethod;

const PickupFulfillment: React.FC<PickupFulfillmentProps> = ({
    children,
    onPickupContinue,
    onUnhandledError,
}) => {
    const {
        cart,
        consignments,
        createConsignments,
        deleteConsignment,
        loadPickupOptions,
        shippingAddress,
        updateShippingAddress,
    } = useShipping();

    const [fulfillmentMethod, setFulfillmentMethod] =
        useState<FulfillmentMethod>('delivery');
    const [isUpdating, setIsUpdating] = useState(false);
    const [pickupMethod, setPickupMethod] = useState<PickupMethod>();

    const deliveryAddressRef = useRef<AddressRequestBody | undefined>();

    const selectedPickupConsignment = consignments.find(
        (consignment) => consignment.selectedPickupOption,
    );

    useEffect(() => {
        setFulfillmentMethod(selectedPickupConsignment ? 'pickup' : 'delivery');
    }, [selectedPickupConsignment]);

    const selectPickup = useCallback(async () => {
        if (consignments.length > 1) {
            throw new Error(
                'Pickup is unavailable while multiple shipping addresses are in use.',
            );
        }

        const lineItems = cart.lineItems.physicalItems
            .filter((item) => item.isShippingRequired)
            .map(({ id, quantity }) => ({
                itemId: id,
                quantity,
            }));

        if (!lineItems.length) {
            throw new Error(
                'This checkout has no physical items eligible for pickup.',
            );
        }

        const deliveryConsignmentId = consignments[0]?.id;

        if (deliveryConsignmentId && !shippingAddress) {
            throw new Error(
                'Pickup is unavailable because the existing delivery address cannot be restored.',
            );
        }

        deliveryAddressRef.current = shippingAddress;

        const probeAddress = flowerDenPickupConfig.probeAddress;

        let deliveryConsignmentDeleted = false;
        let probeConsignmentId: string | undefined;
        let pickupQueryConsignmentId = deliveryConsignmentId;

        try {
            if (!pickupQueryConsignmentId) {
                const probe = await createConsignments([
                    {
                        address: probeAddress,
                        lineItems,
                    },
                ]);

                const probeConsignment = probe.data.getConsignments()?.[0];

                if (!probeConsignment) {
                    throw new Error(
                        'No consignment was returned while preparing pickup availability.',
                    );
                }

                probeConsignmentId = probeConsignment.id;
                pickupQueryConsignmentId = probeConsignment.id;
            }

            const pickupState = await loadPickupOptions({
                consignmentId: pickupQueryConsignmentId,
                searchArea: flowerDenPickupConfig.searchArea,
            });

            const resolvedPickupMethod = getPickupMethod(
                pickupState.data.getPickupOptions(
                    pickupQueryConsignmentId,
                    flowerDenPickupConfig.searchArea,
                ),
            );

            if (!resolvedPickupMethod) {
                throw new Error(
                    'Pickup is unavailable for the items in this cart.',
                );
            }

            if (probeConsignmentId) {
                await deleteConsignment(probeConsignmentId);
                probeConsignmentId = undefined;
            } else if (deliveryConsignmentId) {
                await deleteConsignment(deliveryConsignmentId);
                deliveryConsignmentDeleted = true;
            }

            const selected = await createConsignments([
                {
                    address: probeAddress,
                    lineItems,
                    pickupOption: {
                        pickupMethodId: resolvedPickupMethod.id,
                    },
                },
            ]);

            const selectedConsignment =
                selected.data.getConsignments()?.[0];

            if (
                !selectedConsignment?.selectedPickupOption ||
                selectedConsignment.selectedPickupOption.pickupMethodId !==
                    resolvedPickupMethod.id
            ) {
                throw new Error(
                    'BigCommerce did not confirm the selected pickup method.',
                );
            }

            setPickupMethod(resolvedPickupMethod);
            setFulfillmentMethod('pickup');
        } catch (error) {
            if (
                deliveryConsignmentDeleted &&
                deliveryAddressRef.current
            ) {
                await updateShippingAddress(
                    deliveryAddressRef.current,
                );
            }

            throw error;
        } finally {
            if (probeConsignmentId) {
                await deleteConsignment(probeConsignmentId);
            }
        }
    }, [
        cart,
        consignments,
        createConsignments,
        deleteConsignment,
        loadPickupOptions,
        shippingAddress,
        updateShippingAddress,
    ]);

    const selectDelivery = useCallback(async () => {
        if (selectedPickupConsignment) {
            await deleteConsignment(selectedPickupConsignment.id);
        }

        if (deliveryAddressRef.current) {
            await updateShippingAddress(deliveryAddressRef.current);
        }

        setPickupMethod(undefined);
        setFulfillmentMethod('delivery');
    }, [
        deleteConsignment,
        selectedPickupConsignment,
        updateShippingAddress,
    ]);

    const handleFulfillmentChange = async (
        method: FulfillmentMethod,
    ) => {
        if (method === fulfillmentMethod || isUpdating) {
            return;
        }

        setIsUpdating(true);

        try {
            if (method === 'pickup') {
                await selectPickup();
            } else {
                await selectDelivery();
            }
        } catch (error) {
            onUnhandledError(
                error instanceof Error
                    ? error
                    : new Error('Unable to update fulfillment.'),
            );
        } finally {
            setIsUpdating(false);
        }
    };

    const pickupAddress =
        selectedPickupConsignment?.shippingAddress ||
        selectedPickupConsignment?.address;

    return (
        <>
            <fieldset
                className="form-fieldset"
                disabled={isUpdating}
            >
                <legend className="form-legend">
                    Fulfillment
                </legend>

                <div className="form-field">
                    <label
                        className="form-label"
                        htmlFor="fulfillment-delivery"
                    >
                        <input
                            checked={
                                fulfillmentMethod === 'delivery'
                            }
                            id="fulfillment-delivery"
                            name="fulfillment-method"
                            onChange={() =>
                                void handleFulfillmentChange(
                                    'delivery',
                                )
                            }
                            type="radio"
                        />
                        Delivery
                    </label>
                </div>

                <div className="form-field">
                    <label
                        className="form-label"
                        htmlFor="fulfillment-pickup"
                    >
                        <input
                            checked={
                                fulfillmentMethod === 'pickup'
                            }
                            id="fulfillment-pickup"
                            name="fulfillment-method"
                            onChange={() =>
                                void handleFulfillmentChange(
                                    'pickup',
                                )
                            }
                            type="radio"
                        />
                        Pick Up at Flower Den
                    </label>
                </div>
            </fieldset>

            {fulfillmentMethod === 'pickup' ? (
                <section
                    aria-live="polite"
                    className="form-fieldset"
                >
                    <h2 className="form-legend">
                        {pickupMethod?.displayName ||
                            'Pick Up at Flower Den'}
                    </h2>

                    {pickupMethod?.collectionInstructions && (
                        <p>
                            {
                                pickupMethod.collectionInstructions
                            }
                        </p>
                    )}

                    {pickupMethod?.collectionTimeDescription && (
                        <p>
                            {
                                pickupMethod.collectionTimeDescription
                            }
                        </p>
                    )}

                    {pickupAddress && (
                        <PickupAddress
                            address={pickupAddress}
                        />
                    )}
                    <div className="form-actions">
    <button
        className="button button--primary"
        onClick={onPickupContinue}
        type="button"
    >
        Continue
    </button>
</div>
                </section>
            ) : (
                children
            )}
        </>
    );
};

const PickupAddress: React.FC<{ address: Address }> = ({
    address,
}) => (
    <address>
        <div>{address.address1}</div>

        {address.address2 && (
            <div>{address.address2}</div>
        )}

        <div>
            {[
                address.city,
                address.stateOrProvinceCode ||
                    address.stateOrProvince,
                address.postalCode,
            ]
                .filter(Boolean)
                .join(', ')}
        </div>

        <div>{address.country}</div>
    </address>
);

export default PickupFulfillment;