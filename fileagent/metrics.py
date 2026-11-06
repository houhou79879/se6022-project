"""Small offline KS statistic with permutation p-value and fixed-bin PSI."""
import bisect
import math
import random

def ks_stat(a,b):
    a=sorted(a); b=sorted(b)
    return max(abs(bisect.bisect_right(a,x)/len(a)-bisect.bisect_right(b,x)/len(b)) for x in set(a+b))

def distribution_shift(reference,current):
    if len(reference)<10 or len(current)<10: return {'status':'INSUFFICIENT_DATA'}
    d=ks_stat(reference,current)
    rng=random.Random(42); pooled=list(reference)+list(current); extreme=0
    for _ in range(499):
        rng.shuffle(pooled)
        extreme+=ks_stat(pooled[:len(reference)],pooled[len(reference):])>=d
    p=(extreme+1)/500
    # Fixed business bins, valid even when reference samples are identical.
    edges=[0,2,4,6,12,25,float('inf')]
    def proportions(values):
        counts=[0]*6
        for x in values: counts[min(5,max(0,bisect.bisect_right(edges,x)-1))]+=1
        return [(n+0.5)/(len(values)+3) for n in counts]
    a=proportions(reference); b=proportions(current)
    psi=sum((y-x)*math.log(y/x) for x,y in zip(a,b))
    return {'ks':d,'p_value':p,'psi':psi,'alert':p<0.01 or psi>0.2,
            'method':'two-sample KS statistic; seeded 499-permutation p-value; smoothed fixed-bin PSI'}
