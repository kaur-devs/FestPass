import { prepareTestDatabase, testDatabaseUrl } from '../testing';

export default function setup() {
  return prepareTestDatabase(testDatabaseUrl('festpass_test'));
}
