
import { isNotNull, isNotUndefined } from './predicates';

describe('isNotUndefined', () => {

  it('should return true for a random value', () => {
    expect(isNotUndefined('hello')).toBeTruthy();
  });

  it('should return true for a nullable value', () => {
    expect(isNotUndefined(null)).toBeTruthy();
  });

  it('should return false for a, undefined', () => {
    expect(isNotUndefined(undefined)).toBeFalsy();
  });

});

describe('isNotNull', () => {

  it('should return true for a random value', () => {
    expect(isNotNull('hello')).toBeTruthy();
  });

  it('should return true for an nullable value', () => {
    expect(isNotNull(undefined)).toBeTruthy();
  });

  it('should return false for null', () => {
    expect(isNotNull(null)).toBeFalsy();
  });

});