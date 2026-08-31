import { type AddressRequestBody, type SearchArea } from '@bigcommerce/checkout-sdk';

type PickupProbeAddress = Omit<AddressRequestBody, 'phone'> & {
    country: string;
};

export const flowerDenPickupConfig: {
    searchArea: SearchArea;
    probeAddress: AddressRequestBody & {
        country: string;
    };
} = {
    searchArea: {
        coordinates: {
            latitude: 38.7361392,
            longitude: -77.1890343,
        },
        radius: {
            unit: 'KM' as SearchArea['radius']['unit'],
            value: 25,
        },
    },
    probeAddress: {
        address1: '8196 Terminal Rd',
        address2: 'Unit C',
        city: 'Lorton',
        company: 'Flower Den Florist',
        country: 'United States',
        countryCode: 'US',
        customFields: [],
        firstName: 'Flower',
        lastName: 'Den',
        phone: '7037509400',
        postalCode: '22079',
        stateOrProvince: 'Virginia',
        stateOrProvinceCode: 'VA',
    },
};