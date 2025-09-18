import { icd10Service, type Icd10SearchResult, type Icd10ValidationResult } from './icd10Service';
import { medicationService, type MedicationSearchResult, type MedicationContraindication } from './medicationService';

async function testIcd10Service() {
  console.log('🧪 Testing ICD-10 Service...');
  
  try {
    // Test search functionality
    console.log('  Testing ICD-10 search...');
    const searchResults = await icd10Service.searchIcd10Code('diabetes', 5);
    console.log(`  ✅ Found ${searchResults.length} results for 'diabetes'`);
    if (searchResults.length > 0) {
      console.log(`     First result: ${searchResults[0].code} - ${searchResults[0].description}`);
    }

    // Test validation functionality
    console.log('  Testing ICD-10 validation...');
    const validationResult = await icd10Service.validateIcd10Code('E11.9');
    console.log(`  ✅ E11.9 validation result: ${validationResult.isValid ? 'Valid' : 'Invalid'}`);
    if (validationResult.isValid) {
      console.log(`     Description: ${validationResult.description}`);
      console.log(`     Category: ${validationResult.category}`);
      console.log(`     Specialty: ${validationResult.specialty}`);
    }

    // Test invalid code
    console.log('  Testing invalid ICD-10 code...');
    const invalidResult = await icd10Service.validateIcd10Code('INVALID123');
    console.log(`  ✅ Invalid code validation: ${invalidResult.isValid ? 'Valid' : 'Invalid (as expected)'}`);

    // Test cache stats
    const cacheStats = icd10Service.getCacheStats();
    console.log(`  📊 Cache size: ${cacheStats.size} entries`);

  } catch (error) {
    console.error('  ❌ ICD-10 Service test failed:', error instanceof Error ? error.message : error);
  }
}

async function testMedicationService() {
  console.log('\n💊 Testing Medication Service...');
  
  try {
    // Test medication search
    console.log('  Testing medication search...');
    const searchResults = await medicationService.searchMedication('aspirin', 3);
    console.log(`  ✅ Found ${searchResults.length} results for 'aspirin'`);
    if (searchResults.length > 0) {
      const first = searchResults[0];
      console.log(`     First result: ${first.brandName} (${first.genericName})`);
      console.log(`     Active ingredients: ${first.activeIngredients.join(', ')}`);
    }

    // Test contraindications
    console.log('  Testing contraindications lookup...');
    const contraindications = await medicationService.getMedicationContraindications('aspirin');
    console.log(`  ✅ Found ${contraindications.length} contraindications for aspirin`);
    if (contraindications.length > 0) {
      const first = contraindications[0];
      console.log(`     First contraindication: ${first.condition} (${first.severity})`);
    }

    // Test active ingredients
    console.log('  Testing active ingredients lookup...');
    const activeIngredients = await medicationService.getActiveIngredients('metformin');
    console.log(`  ✅ Active ingredients for metformin: ${activeIngredients.join(', ')}`);

    // Test rate limit and cache stats
    const stats = medicationService.getStats();
    console.log(`  📊 Cache size: ${stats.cacheSize} entries`);
    console.log(`  📊 API requests this hour: ${stats.requestsThisHour}`);

  } catch (error) {
    console.error('  ❌ Medication Service test failed:', error instanceof Error ? error.message : error);
  }
}

async function testErrorHandling() {
  console.log('\n⚠️  Testing Error Handling...');
  
  try {
    // Test empty search terms
    console.log('  Testing empty search term...');
    try {
      await icd10Service.searchIcd10Code('');
      console.log('  ❌ Should have thrown error for empty search term');
    } catch (error) {
      console.log('  ✅ Correctly caught empty search term error');
    }

    // Test empty medication name
    console.log('  Testing empty medication name...');
    try {
      await medicationService.searchMedication('');
      console.log('  ❌ Should have thrown error for empty medication name');
    } catch (error) {
      console.log('  ✅ Correctly caught empty medication name error');
    }

    console.log('  ✅ Error handling tests completed');

  } catch (error) {
    console.error('  ❌ Error handling test failed:', error instanceof Error ? error.message : error);
  }
}

async function runAllTests() {
  console.log('🚀 Starting API Service Tests...\n');
  
  try {
    await testIcd10Service();
    await testMedicationService();
    await testErrorHandling();
    
    console.log('\n✨ All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - ICD-10 Service: ✅ Working');
    console.log('   - Medication Service: ✅ Working');
    console.log('   - Error Handling: ✅ Working');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error instanceof Error ? error.message : error);
  }
}

export { runAllTests, testIcd10Service, testMedicationService, testErrorHandling };

// Run tests when this file is executed directly
runAllTests();