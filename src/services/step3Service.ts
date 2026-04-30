import type { ItineraryDraft } from '../shared/step1-contract';
import type { AccommodationTransport } from '../shared/step2-contract';
import type { BudgetCalculation } from '../shared/step3-contract';
import type { TravelInputs } from './travelService';

/**
 * Step 3: Pure JS budget calculation.
 * No AI calls, no network requests — just math.
 *
 * Takes Step 1 (itinerary) + Step 2 (accommodations/transport) + user inputs
 * and produces a detailed BudgetCalculation.
 */
export function calculateBudget(
  step1: ItineraryDraft,
  step2: AccommodationTransport,
  inputs: TravelInputs
): BudgetCalculation {
  const totalDays = Math.round(
    (new Date(inputs.endDate).getTime() - new Date(inputs.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  ) + 1;

  const totalPeople = inputs.people.adults + inputs.people.children.length;

  // ─── 1. Flights ───
  // Sum first option's estimatedPrice per segment, multiplied by totalPeople
  const flightItems = (step2.flights ?? []).map((segment) => {
    const firstOption = segment.options[0];
    const pricePerPerson = firstOption?.estimatedPrice ?? 0;
    return {
      segment,
      pricePerPerson,
      total: pricePerPerson * totalPeople,
    };
  });

  const flightsTotal = flightItems.reduce((sum, f) => sum + f.total, 0);

  // ─── 2. Accommodation ───
  // For each stop, take the first option's estimatedPricePerNight * nights
  const accommodationItems = step2.accommodations.map((stop) => {
    const firstOption = stop.options[0];
    const pricePerNight = firstOption?.estimatedPricePerNight ?? 0;
    const nights = stop.nights ?? 1;
    const total = pricePerNight * nights;
    return {
      stopName: stop.stopName,
      pricePerNight,
      nights,
      total,
    };
  });

  const accommodationTotal = accommodationItems.reduce(
    (sum, a) => sum + a.total,
    0
  );

  // ─── 3. Activities ───
  // Sum all costEstimate from itinerary activities
  const activityItems: { name: string; cost: number; notes?: string }[] = [];
  let activitiesTotal = 0;

  for (const day of step1.itinerary) {
    for (const activity of day.activities) {
      if (activity.costEstimate != null) {
        activitiesTotal += activity.costEstimate;
        activityItems.push({
          name: activity.name ?? activity.description.slice(0, 40),
          cost: activity.costEstimate,
          notes: `Giorno ${day.day}`,
        });
      }
    }
  }

  // ─── 4. Food ───
  // Determine daily rate based on input budget tier
  const budget = inputs.budget;
  let foodDailyRate: number;
  if (budget < 2000) {
    foodDailyRate = 35;
  } else if (budget <= 4000) {
    foodDailyRate = 50;
  } else {
    foodDailyRate = 65;
  }

  // Adults pay full rate, children pay 50%
  const adultFoodCost = inputs.people.adults * foodDailyRate * totalDays;
  const childFoodCost =
    inputs.people.children.length * (foodDailyRate * 0.5) * totalDays;
  const foodTotal = adultFoodCost + childFoodCost;

  // ─── 5. Transport ───
  // If step1.transportInfo.estimatedLocalCost exists, parse it and multiply by
  // totalDays; otherwise estimate €20/person/day
  let transportTotal: number;
  let transportNotes: string;

  if (step1.transportInfo?.estimatedLocalCost) {
    const parsed = parseFloat(
      step1.transportInfo.estimatedLocalCost.replace(/[^\d.,]/g, '').replace(',', '.')
    );
    const dailyCost = isNaN(parsed) ? 0 : parsed;
    transportTotal = dailyCost * totalDays;
    transportNotes = `€${dailyCost.toFixed(0)}/giorno × ${totalDays} giorni`;
  } else {
    transportTotal = 20 * totalPeople * totalDays;
    transportNotes = `Stima: €20/persona/giorno`;
  }

  // ─── 6. Misc (10% buffer) ───
  const subtotal =
    flightsTotal + accommodationTotal + activitiesTotal + foodTotal + transportTotal;
  const misc = Math.round(subtotal * 0.1);

  // ─── 7. Total ───
  const totalEstimated =
    flightsTotal + accommodationTotal + activitiesTotal + foodTotal + transportTotal + misc;

  // ─── 8. Per person per day ───
  const perPersonPerDay =
    totalPeople > 0 && totalDays > 0
      ? Math.round((totalEstimated / totalPeople / totalDays) * 100) / 100
      : 0;

  // ─── 9. Budget warning ───
  let budgetWarning: string | null = null;
  if (totalEstimated > budget) {
    const diff = totalEstimated - budget;
    budgetWarning = `Budget stimato €${totalEstimated} supera il budget di €${budget} di €${diff}`;
  }

  // ─── 10. Cost table ───
  const costTable: BudgetCalculation['costTable'] = [
    {
      category: 'Voli',
      items: flightItems.map((f, i) => ({
        name: f.segment.segmentName ?? `Tratta ${i + 1}`,
        cost: f.total,
        notes: `${f.pricePerPerson}€/persona × ${totalPeople} persone`,
      })),
      subtotal: flightsTotal,
    },
    {
      category: 'Alloggi',
      items: accommodationItems.map((a) => ({
        name: a.stopName,
        cost: a.total,
        notes: `${a.pricePerNight}€/notte × ${a.nights} notti`,
      })),
      subtotal: accommodationTotal,
    },
    {
      category: 'Attività',
      items: activityItems,
      subtotal: activitiesTotal,
    },
    {
      category: 'Cibo',
      items: [
        {
          name: 'Adulti',
          cost: adultFoodCost,
          notes: `${inputs.people.adults} × ${foodDailyRate}€/giorno × ${totalDays} giorni`,
        },
        ...(inputs.people.children.length > 0
          ? [
              {
                name: 'Bambini',
                cost: childFoodCost,
                notes: `${inputs.people.children.length} × ${(foodDailyRate * 0.5).toFixed(0)}€/giorno × ${totalDays} giorni`,
              },
            ]
          : []),
      ],
      subtotal: foodTotal,
    },
    {
      category: 'Trasporti locali',
      items: [
        {
          name: 'Trasporti',
          cost: transportTotal,
          notes: transportNotes,
        },
      ],
      subtotal: transportTotal,
    },
    {
      category: 'Extra',
      items: [
        {
          name: 'Buffer imprevisti (10%)',
          cost: misc,
          notes: '10% del subtotale come margine di sicurezza',
        },
      ],
      subtotal: misc,
    },
  ];

  // ─── Build result ───
  const result: BudgetCalculation = {
    budgetBreakdown: {
      flights: flightsTotal,
      accommodation: accommodationTotal,
      activities: activitiesTotal,
      food: foodTotal,
      totalEstimated,
      transport: transportTotal,
      misc,
      perPersonPerDay,
    },
    budgetWarning,
    costTable,
  };

  return result;
}