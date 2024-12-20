import { Static, Type, TSchema } from '@sinclair/typebox';
import { lineString } from '@turf/helpers';
import { lineSliceAlong } from '@turf/line-slice-along';
import { length } from '@turf/length';
import type { Event } from '@tak-ps/etl';
import ETL, { fetch, SchemaType, handler as internal, local, InputFeatureCollection } from '@tak-ps/etl';

/**
 * The Input Schema contains the environment object that will be requested via the CloudTAK UI
 * It should be a valid TypeBox object - https://github.com/sinclairzx81/typebox
 */
const InputSchema = Type.Object({
    'DEBUG': Type.Boolean({
        default: false,
        description: 'Print results in logs'
    })
});

/**
 * The Output Schema contains the known properties that will be returned on the
 * GeoJSON Feature in the .properties.metdata object
 */
const OutputSchema = Type.Object({})

export default class Task extends ETL {
    static name = 'etl-santa'

    async schema(type: SchemaType = SchemaType.Input): Promise<TSchema> {
        if (type === SchemaType.Input) {
            return InputSchema;
        } else {
            return OutputSchema;
        }
    }

    async control(): Promise<void> {
        const res = await fetch('https://santa-api.appspot.com/info?client=web&language=en&fingerprint=&routeOffset=0&streamOffset=0');

        const body = await res.typed(Type.Object({
            status: Type.String(),
            v: Type.String(),
            now: Type.Integer(),
            takeoff: Type.Integer(),
            duration: Type.Integer(),
            location: Type.String(),
            route: Type.Array(Type.String())
        }));

        const fc: Static<typeof InputFeatureCollection> = {
            type: 'FeatureCollection',
            features: []
        }

        const year = new Date().getFullYear();

        // Debug Ability
        // body.now = new Date('2024-12-25T10:54:01.000Z').getTime();
        if (body.now < body.takeoff) {
            fc.features.push({
                id: 'santa',
                type: 'Feature',
                properties: {
                    callsign: 'Santa',
                },
                geometry: {
                    type: 'Point',
                    coordinates: [ 90, 90 ]
                }
            });
        } else if (body.route.length) {
            const routeRes = await fetch(body.route[0]);
            const route = await routeRes.typed(Type.Object({
                destinations: Type.Array(Type.Object({
                    id: Type.String(),
                    arrival: Type.Integer(),
                    departure: Type.Integer(),
                    population: Type.Integer(),
                    presentsDelivered: Type.Integer(),
                    city: Type.String(),
                    region: Type.String(),
                    location: Type.Object({
                        lat: Type.Number(),
                        lng: Type.Number(),
                    }),
                    details: Type.Object({
                        timezone: Type.Integer(),
                        photos: Type.Array(Type.Object({
                            url: Type.String()
                        }))
                    }),
                }))
            }))

            const now = new Date(body.now);

            let prev;

            for (let i = 0; i < route.destinations.length; i++) {
                const dest = route.destinations[i];

                const arrival = new Date(dest.arrival)
                arrival.setFullYear(year);
                const departure = new Date(dest.departure)
                departure.setFullYear(year);

                if (now >= arrival && now <= departure) {
                    fc.features.push({
                        id: 'santa',
                        type: 'Feature',
                        properties: {
                            callsign: 'Santa',
                            remarks: `Delivering presents in ${dest.city}, ${dest.region}\nPopulation: ${dest.population}`,
                            links: dest.details.photos.map((photo, id) => {
                                return {
                                    url: photo.url,
                                    mime: 'text/html',
                                    remarks: `Photo of ${dest.city}, ${dest.region} #${id}`
                                }
                            })
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [ dest.location.lng, dest.location.lat ]
                        }
                    });
                    break;
                } else if (now < arrival && prev) {
                    const line = lineString([
                        [prev.location.lng, prev.location.lat],
                        [dest.location.lng, dest.location.lat]
                    ]);

                    const total = dest.arrival - prev.departure;
                    const flown = body.now - new Date(prev.departure).setFullYear(year);
                    const percentage = flown/total;

                    const lineLength = length(line);

                    const slice = lineSliceAlong(line, 0, lineLength * percentage)

                    fc.features.push({
                        id: 'santa',
                        type: 'Feature',
                        properties: {
                            callsign: 'Santa',
                            remarks: `Santa is flying from ${prev.city}, ${prev.region} to ${dest.city}, ${dest.region}`,
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: slice.geometry.coordinates[1]
                        }
                    });
                }

                prev = dest;
            }
        }

        await this.submit(fc);
    }
}

await local(new Task(import.meta.url), import.meta.url);
export async function handler(event: Event = {}) {
    return await internal(new Task(import.meta.url), event);
}

