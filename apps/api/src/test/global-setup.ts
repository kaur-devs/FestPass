import { prepareTestDatabase } from '@festpass/db/testing';
import { TEST_DATABASE_URL } from './database';

export default function setup() {
  return prepareTestDatabase(TEST_DATABASE_URL);
}
