import { type AddressRequestBody } from '@bigcommerce/checkout-sdk';

type PickupProbeAddress = Omit<AddressRequestBody, 'phone'> & {
    country: string;
};

export const flowerDenPickupConfig: {
    probeAddress: PickupProbeAddress;
    searchArea: {
        coordinates: { latitude: number; longitude: number };
        radius: { unit: 'KM'; value: number };
    };
} = {
    searchArea: {
        coordinates: {
            latitude: 38.7361392,
            longitude: -77.1890343,
        },
        radius: {
            unit: 'KM',
            value: 25,
        },
    },
    probeAddress: {
        address1: '8196 Terminal Rd',
        address2: 'Unit C',
        city: 'Lorton',
        company: '',
        country: 'United States',
        countryCode: 'US',
        customFields: [],
        firstName: 'Flower',
        lastName: 'Den',
        postalCode: '22079',
        stateOrProvince: 'Virginia',
        stateOrProvinceCode: 'VA',
    },
};