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
  const startDate = new Date(inputs.startDate);

  // ─── 1. Trasporti (flights/trains/car) ───
  const transportItems = (step2.flights ?? []).map((segment, i) => {
    const idx = segment.selectedIndex ?? 0;
    const selectedOption = segment.options[idx];
    const pricePerPerson = selectedOption?.estimatedPrice ?? 0;
    const total = pricePerPerson * totalPeople;

    // Get date for this segment: first segment = departure date, subsequent = based on stop accumulation
    let segmentDate = inputs.startDate;
    // For car routes, date can be inferred from stop position
    if (i > 0 && step2.accommodations.length > 0) {
      let dayOffset = 0;
      for (let j = 0; j < Math.min(i, step2.accommodations.length); j++) {
        dayOffset += step2.accommodations[j].nights ?? 1;
      }
      const d = new Date(startDate);
      d.setDate(d.getDate() + dayOffset);
      segmentDate = d.toISOString().split('T')[0];
    }
    // Last segment (return) date = end date
    if (i === (step2.flights?.length ?? 0) - 1) {
      segmentDate = inputs.endDate;
    }

    return {
      segment,
      pricePerPerson,
      total,
      date: segmentDate,
      description: segment.segmentName ?? `Tratta ${i + 1}`,
      optionLabel: selectedOption?.airline ?? '',
    };
  });

  const transportTotal = transportItems.reduce((sum, f) => sum + f.total, 0);

  // ─── 2. Accommodation ───
  const accommodationItems = step2.accommodations.map((stop, i) => {
    const idx = stop.selectedIndex ?? 0;
    const selectedOption = stop.options[idx];
    const pricePerNight = selectedOption?.estimatedPricePerNight ?? 0;
    const nights = stop.nights ?? 1;
    const total = pricePerNight * nights;

    // Calculate arrival date
    let dayOffset = 0;
    for (let j = 0; j < i; j++) {
      dayOffset += step2.accommodations[j].nights ?? 1;
    }
    const arrivalDate = new Date(startDate);
    arrivalDate.setDate(arrivalDate.getDate() + dayOffset);
    const arrivalDateStr = arrivalDate.toISOString().split('T')[0];

    return {
      stopName: stop.stopName,
      hotelName: selectedOption?.name ?? stop.stopName,
      pricePerNight,
      nights,
      total,
      arrivalDate: arrivalDateStr,
    };
  });

  const accommodationTotal = accommodationItems.reduce(
    (sum, a) => sum + a.total,
    0
  );

  // ─── 3. Activities ───
  const activityItems: {
    name: string;
    cost: number;
    date: string;
    location: string;
    description: string;
    duration: string;
  }[] = [];
  let activitiesTotal = 0;

  for (const day of step1.itinerary) {
    // Calculate date for this day
    const dayDate = new Date(startDate);
    dayDate.setDate(dayDate.getDate() + (day.day - 1));
    const dateStr = dayDate.toISOString().split('T')[0];

    for (const activity of day.activities) {
      if (activity.costEstimate != null && activity.costEstimate > 0) {
        activitiesTotal += activity.costEstimate;
        activityItems.push({
          name: activity.name ?? 'Attività',
          cost: activity.costEstimate,
          date: dateStr,
          location: activity.location ?? day.title ?? '',
          description: activity.description?.slice(0, 80) ?? activity.name ?? '',
          duration: activity.duration ?? '',
        });
      }
    }
  }

  // ─── 4. Food ───
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

  // ─── 5. Extra/Imprevisti (10% buffer) ───
  const subtotal = transportTotal + accommodationTotal + activitiesTotal + foodTotal;
  const misc = Math.round(subtotal * 0.1);

  // ─── 6. Total ───
  const totalEstimated = transportTotal + accommodationTotal + activitiesTotal + foodTotal + misc;

  // ─── 7. Per person per day ───
  const perPersonPerDay =
    totalPeople > 0 && totalDays > 0
      ? Math.round((totalEstimated / totalPeople / totalDays) * 100) / 100
      : 0;

  // ─── 8. Budget warning ───
  let budgetWarning: string | null = null;
  if (totalEstimated > budget) {
    const diff = totalEstimated - budget;
    budgetWarning = `Budget stimato €${totalEstimated} supera il budget di €${budget} di €${diff}`;
  }

  // ─── 9. Cost table ───
  const costTable: BudgetCalculation['costTable'] = [
    {
      category: 'Trasporti',
      items: transportItems.map((f) => ({
        name: f.description,
        cost: f.total,
        notes: `${f.pricePerPerson}€/persona × ${totalPeople} persone`,
        date: f.date,
        description: f.optionLabel,
      })),
      subtotal: transportTotal,
    },
    {
      category: 'Alloggi',
      items: accommodationItems.map((a) => ({
        name: a.stopName,
        cost: a.total,
        notes: `${a.pricePerNight}€/notte × ${a.nights} notti`,
        date: a.arrivalDate,
        location: a.stopName,
        hotelName: a.hotelName,
        nights: a.nights,
      })),
      subtotal: accommodationTotal,
    },
    {
      category: 'Attività',
      items: activityItems.map((a) => ({
        name: a.name,
        cost: a.cost,
        date: a.date,
        location: a.location,
        description: a.description,
        duration: a.duration,
      })),
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
      category: 'Extra e Imprevisti',
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
      flights: transportTotal,
      accommodation: accommodationTotal,
      activities: activitiesTotal,
      food: foodTotal,
      totalEstimated,
      misc,
      perPersonPerDay,
    },
    budgetWarning,
    costTable,
  };

  return result;
}