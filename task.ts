import { Static, Type, TSchema } from '@sinclair/typebox';
import type { Event } from '@tak-ps/etl';
import ETL, { fetch, SchemaType, handler as internal, local, InputFeatureCollection, InputFeature } from '@tak-ps/etl';

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
            location: Type.String()
        }));

        const fc: Static<typeof InputFeatureCollection> = {
            type: 'FeatureCollection',
            features: []
        }

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
        } else {

        }

        await this.submit(fc);
    }
}

await local(new Task(import.meta.url), import.meta.url);
export async function handler(event: Event = {}) {
    return await internal(new Task(import.meta.url), event);
}

