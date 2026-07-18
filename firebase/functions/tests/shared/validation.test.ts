import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseInput } from '../../src/shared/validation';
import { ValidationError } from '../../src/shared/errors';

const schema = z.object({
  pincode: z.string().regex(/^\d{6}$/),
  quantity: z.number().int().min(1),
});

describe('parseInput', () => {
  it('returns the parsed, typed value on success', () => {
    const result = parseInput(schema, { pincode: '500001', quantity: 2 });
    expect(result).toEqual({ pincode: '500001', quantity: 2 });
  });

  it('throws ValidationError (not the raw ZodError) on failure', () => {
    expect(() => parseInput(schema, { pincode: 'bad', quantity: 0 })).toThrow(ValidationError);
  });

  it('attaches the field-level Zod error details', () => {
    try {
      parseInput(schema, { pincode: 'bad', quantity: 0 });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const details = (err as ValidationError).details as { fieldErrors: Record<string, string[]> };
      expect(details.fieldErrors).toHaveProperty('pincode');
      expect(details.fieldErrors).toHaveProperty('quantity');
    }
  });
});
